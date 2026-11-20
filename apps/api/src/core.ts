import { randomUUID, createHmac } from 'node:crypto';
import { Global, HttpException, Injectable, Module, createParamDecorator } from '@nestjs/common';
import type { ExecutionContext, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { uuid } from '../../../packages/contracts/src/index.js';

export type Tx = Prisma.TransactionClient;
export type Identity = { subject: string; email: string };
export const Actor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Identity => ctx.switchToHttp().getRequest().identity,
);
export function fail(status: number, code: string, message: string): never {
  throw new HttpException({ code, message }, status);
}
export const hidden = () => fail(404, 'NOT_FOUND', 'Recurso indisponível para esta conta.');
export const conflict = (code: string, message: string) => fail(409, code, message);
export function input<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) fail(400, 'INVALID_INPUT', 'Um ou mais campos são inválidos.');
  return result.data;
}
export function setting(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error('Configuração ausente: ' + name);
  return value;
}
@Injectable()
export class Db extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: setting('DATABASE_URL'), max: 15 }) });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
export async function lock(tx: Tx, name: string) {
  await tx.$queryRaw`SELECT 1::int AS ok FROM pg_advisory_xact_lock(hashtextextended(${name}, 0))`;
}
export async function instantNow(tx: Tx) {
  const [row] = await tx.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp()::timestamptz(3) AS at`;
  return row.at;
}
export async function principal(tx: Tx, identity: Identity) {
  const user = await tx.user.findUnique({
    where: { authSubject: identity.subject },
    include: { trainerProfile: true, studentProfile: true },
  });
  if (user && user.accountStatus !== 'ACTIVE') fail(403, 'ACCOUNT_RESTRICTED', 'Conta indisponível.');
  return user;
}
export type User = NonNullable<Awaited<ReturnType<typeof principal>>>;
export function active(user: User | null): User {
  if (!user) fail(403, 'PROFILE_REQUIRED', 'Complete o cadastro para continuar.');
  return user;
}
export function trainer(user: User) {
  if (!user.trainerProfile || user.role !== 'TRAINER')
    fail(403, 'TRAINER_ONLY', 'Ação exclusiva do personal.');
  return user.trainerProfile;
}
export function student(user: User) {
  if (!user.studentProfile || user.role !== 'STUDENT')
    fail(403, 'STUDENT_ONLY', 'Ação exclusiva do aluno.');
  return user.studentProfile;
}
type Json = Prisma.InputJsonObject;
export type MutationResult = { receipt: Json; subjects?: string[] };
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value) ?? 'null';
}
@Injectable()
export class Operations {
  private readonly key: Buffer;
  constructor(readonly db: Db) {
    const secret = setting('AUDIT_HMAC_KEY');
    if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error('AUDIT_HMAC_KEY requer 32 bytes em hexadecimal.');
    this.key = Buffer.from(secret, 'hex');
  }
  read<T>(identity: Identity, fn: (tx: Tx, user: User) => Promise<T>) {
    return this.db.$transaction(async (tx) => fn(tx, active(await principal(tx, identity))), {
      timeout: 15000,
    });
  }
  async write(
    identity: Identity,
    rawKey: unknown,
    code: string,
    params: object,
    fn: (tx: Tx, user: User | null, operationId: string) => Promise<MutationResult>,
    onboarding = false,
  ) {
    const operationKey = input(uuid, rawKey);
    const signature = createHmac('sha256', this.key)
      .update(canonical([code, params]))
      .digest('hex');
    const actorRef = identity.subject;
    const operationId = randomUUID();
    try {
      return await this.db.$transaction(
        async (tx) => {
          await lock(tx, 'command:' + actorRef + ':' + operationKey);
          const user = await principal(tx, identity);
          if (!onboarding) active(user);
          const previous = await tx.auditEvent.findUnique({
            where: { actorRef_operationKey: { actorRef, operationKey } },
          });
          if (previous) {
            if (previous.operationSignature !== signature)
              conflict('KEY_REUSED', 'A chave já foi usada com outros parâmetros.');
            return previous.receipt;
          }
          const result = await fn(tx, user, operationId);
          await tx.auditEvent.create({
            data: {
              id: operationId,
              actorType: 'USER',
              actorRef,
              operationKey,
              operationCode: code,
              operationSignature: signature,
              outcome: 'SUCCESS',
              receipt: result.receipt,
            },
          });
          const subjects = [...new Set([...(user ? [user.id] : []), ...(result.subjects ?? [])])];
          if (subjects.length)
            await tx.auditEventSubject.createMany({
              data: subjects.map((userId) => ({ operationId, userId })),
            });
          return result.receipt;
        },
        { isolationLevel: 'ReadCommitted', timeout: 15000, maxWait: 10000 },
      );
    } catch (error) {
      // Independent event without token, email, payload, notes or body measurements.
      const outcome = error instanceof HttpException && error.getStatus() < 500 ? 'DENIED' : 'FAILED';
      console.warn(JSON.stringify({ operationId, code, outcome }));
      throw error;
    }
  }
}
export function cursorPage(limit: number, after?: string) {
  return {
    take: limit + 1,
    ...(after ? { where: { id: { gt: after } } } : {}),
    orderBy: { id: 'asc' as const },
  };
}
export function listed<T extends { id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  return { items, next: rows.length > limit ? items[items.length - 1].id : null };
}
@Global()
@Module({ providers: [Db, Operations], exports: [Db, Operations] })
export class CoreModule {}
