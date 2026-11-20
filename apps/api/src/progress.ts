import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Module,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  invalidation,
  page,
  uuid,
  weightCorrection,
  weightEntry,
} from '../../../packages/contracts/src/index.js';
import type { Weight } from '../../../packages/contracts/src/index.js';
import { readStudent } from './access.js';
import {
  Actor,
  Operations,
  active,
  conflict,
  cursorPage,
  hidden,
  input,
  listed,
  lock,
  student,
} from './core.js';
import type { Identity } from './core.js';

function snapshot(data: Weight, status: string) {
  return {
    kg: data.kg,
    measuredAt: new Date(data.measuredAt).toISOString(),
    note: data.note ?? null,
    status,
  };
}
@Controller()
class ProgressController {
  constructor(private readonly ops: Operations) {}
  @Post('me/weights')
  @HttpCode(201)
  create(@Actor() who: Identity, @Headers('idempotency-key') key: string, @Body() raw: unknown) {
    const data = input(weightEntry, raw);
    return this.ops.write(who, key, 'weight.create', data, async (tx, actor) => {
      const user = active(actor),
        owner = student(user);
      const recordId = randomUUID(),
        revisionId = randomUUID();
      await tx.bodyWeightRecord.create({
        data: {
          id: recordId,
          studentId: owner.id,
          currentRevisionId: revisionId,
          kg: data.kg,
          measuredAt: new Date(data.measuredAt),
          note: data.note,
        },
      });
      await tx.bodyWeightRevision.create({
        data: {
          id: revisionId,
          recordId,
          actorUserId: user.id,
          revisionNumber: 1,
          snapshot: snapshot(data, 'ACTIVE'),
        },
      });
      return { receipt: { id: recordId, revision: 1 } };
    });
  }
  @Get('students/:id/weights')
  weights(@Actor() who: Identity, @Param('id') id: string, @Query() raw: unknown) {
    const studentId = input(uuid, id),
      { limit, after } = input(page, raw);
    return this.ops.read(who, async (tx, user) => {
      await readStudent(tx, user, studentId);
      const q = cursorPage(limit, after);
      const rows = await tx.bodyWeightRecord.findMany({
        ...q,
        where: { ...q.where, studentId, ...(user.trainerProfile ? { status: 'ACTIVE' } : {}) },
        select: { id: true, kg: true, measuredAt: true, note: true, status: true, revisionNumber: true },
      });
      return listed(
        rows.map((r) => ({ ...r, kg: Number(r.kg) })),
        limit,
      );
    });
  }
  @Get('me/weights/:id/revisions')
  revisions(@Actor() who: Identity, @Param('id') id: string, @Query() raw: unknown) {
    const recordId = input(uuid, id),
      { limit, after } = input(page, raw);
    return this.ops.read(who, async (tx, user) => {
      const studentId = student(user).id;
      if (!(await tx.bodyWeightRecord.findFirst({ where: { id: recordId, studentId } }))) return hidden();
      const q = cursorPage(limit, after);
      return listed(
        await tx.bodyWeightRevision.findMany({
          ...q,
          where: { ...q.where, recordId },
          select: {
            id: true,
            revisionNumber: true,
            previousRevisionId: true,
            snapshot: true,
            reason: true,
            createdAt: true,
          },
        }),
        limit,
      );
    });
  }
  @Patch('me/weights/:id')
  correct(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    const data = input(weightCorrection, raw);
    return this.revise(who, key, input(uuid, id), data, data);
  }
  @Post('me/weights/:id/void')
  @HttpCode(200)
  invalidate(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    return this.revise(who, key, input(uuid, id), input(invalidation, raw));
  }
  private revise(
    who: Identity,
    key: string,
    id: string,
    command: { expectedRevision: number; reason?: string },
    replacement?: Weight,
  ) {
    return this.ops.write(
      who,
      key,
      replacement ? 'weight.correct' : 'weight.void',
      { id, ...command },
      async (tx, actor) => {
        const user = active(actor),
          owner = student(user);
        await lock(tx, 'weight:' + id);
        const record = await tx.bodyWeightRecord.findFirst({ where: { id, studentId: owner.id } });
        if (!record) return hidden();
        if (record.status !== 'ACTIVE' || record.revisionNumber !== command.expectedRevision)
          conflict('REVISION_CONFLICT', 'O registro mudou. Releia a revisão atual.');
        const status = replacement ? 'ACTIVE' : 'VOIDED';
        const values = replacement ?? {
          kg: Number(record.kg),
          measuredAt: record.measuredAt.toISOString(),
          note: record.note,
        };
        const revision = record.revisionNumber + 1;
        const next = await tx.bodyWeightRevision.create({
          data: {
            recordId: id,
            actorUserId: user.id,
            previousRevisionId: record.currentRevisionId,
            revisionNumber: revision,
            reason: command.reason,
            snapshot: snapshot(values, status),
          },
        });
        await tx.bodyWeightRecord.update({
          where: { id },
          data: {
            kg: values.kg,
            measuredAt: new Date(values.measuredAt),
            note: values.note ?? null,
            status,
            revisionNumber: revision,
            currentRevisionId: next.id,
          },
        });
        return { receipt: { id, revision } };
      },
    );
  }
}
@Module({ controllers: [ProgressController] })
export class ProgressModule {}
