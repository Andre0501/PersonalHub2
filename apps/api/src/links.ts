import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Headers, HttpCode, Module, Param, Post, Query } from '@nestjs/common';
import {
  acceptance,
  invitation,
  noFields,
  notice,
  page,
  uuid,
} from '../../../packages/contracts/src/index.js';
import {
  Actor,
  Operations,
  active,
  conflict,
  cursorPage,
  fail,
  hidden,
  input,
  instantNow,
  listed,
  lock,
  student,
  trainer,
} from './core.js';
import type { Identity, Tx, User } from './core.js';
import { requireCapacity } from './entitlements.js';

const lifetime = 168 * 60 * 60 * 1000;
type Link = { id: string; trainerId: string; studentId: string; originRequestId: string };
async function endLink(
  tx: Tx,
  link: Link,
  who: User,
  at: Date,
  operationId: string,
  reason: string,
  replacement?: string,
) {
  await tx.trainerStudentLink.update({
    where: { id: link.id },
    data: {
      status: 'ENDED',
      endedAt: at,
      endReason: reason,
      replacedByLinkId: replacement ?? null,
    },
  });
  await tx.consentRecord.create({
    data: {
      linkId: link.id,
      actorUserId: who.id,
      decision: 'REVOKED',
      purpose: notice.purpose,
      scopeVersion: notice.scope,
      noticeVersion: notice.version,
      relatedRequestId: link.originRequestId,
      createdAt: at,
    },
  });
  await tx.$executeRaw`
    WITH changed AS (
      UPDATE personalhub.appointments SET
        status = CASE WHEN ends_at <= ${at} THEN 'CLOSED_UNRESOLVED' ELSE 'ARCHIVED' END,
        status_reason = CASE WHEN ends_at <= ${at} THEN 'LINK_ENDED_UNRESOLVED'
          WHEN starts_at >= ${at} THEN 'LINK_ENDED_FUTURE' ELSE 'LINK_ENDED_INTERRUPTED' END,
        record_revision = record_revision + 1
      WHERE link_id = ${link.id}::uuid AND status = 'SCHEDULED'
      RETURNING appointment_id, record_revision, status, status_reason)
    INSERT INTO personalhub.appointment_events
      (appointment_id,sequence,operation_id,event_type,previous_status,new_status,reason,created_at)
    SELECT appointment_id,record_revision,${operationId}::uuid,'LINK_ENDED','SCHEDULED',status,status_reason,${at}
    FROM changed`;
}
function roleFilter(user: User) {
  return user.studentProfile ? { studentId: user.studentProfile.id } : { trainerId: trainer(user).id };
}
@Controller()
class LinksController {
  constructor(private readonly ops: Operations) {}
  @Post('link-requests')
  @HttpCode(202)
  invite(@Actor() who: Identity, @Headers('idempotency-key') key: string, @Body() raw: unknown) {
    const data = input(invitation, raw);
    return this.ops.write(who, key, 'links.invite', data, async (tx, actor) => {
      const sender = trainer(active(actor));
      const recipient = await tx.studentProfile.findFirst({
        where: { shareCode: data.studentCode, user: { accountStatus: 'ACTIVE' } },
      });
      if (recipient) await lock(tx, 'student:' + recipient.id);
      await lock(tx, 'trainer:' + sender.id);
      const at = await instantNow(tx);
      const attempts = await tx.auditEvent.count({
        where: {
          actorRef: who.subject,
          operationCode: 'links.invite',
          createdAt: { gt: new Date(at.getTime() - 3600000) },
        },
      });
      if (attempts >= 20) fail(429, 'INVITE_LIMIT', 'Limite de convites por hora atingido.');
      const receipt = { received: true };
      if (!recipient) return { receipt };
      const pair = { trainerId: sender.id, studentId: recipient.id };
      await tx.linkRequest.updateMany({
        where: { ...pair, status: 'PENDING', expiresAt: { lte: at } },
        data: { status: 'EXPIRED', resolvedAt: at, recordRevision: { increment: 1 } },
      });
      const connected = await tx.trainerStudentLink.count({ where: { ...pair, status: 'ACTIVE' } });
      const pending = await tx.linkRequest.count({ where: { ...pair, status: 'PENDING' } });
      if (!connected && !pending)
        await tx.linkRequest.create({
          data: { ...pair, createdAt: at, expiresAt: new Date(at.getTime() + lifetime) },
        });
      return { receipt, subjects: [recipient.userId] };
    });
  }
  @Get('link-requests')
  requests(@Actor() who: Identity, @Query() raw: unknown) {
    const { limit, after } = input(page, raw);
    return this.ops.read(who, async (tx, user) => {
      const at = await instantNow(tx),
        q = cursorPage(limit, after);
      const rows = await tx.linkRequest.findMany({
        ...q,
        where: { ...q.where, ...roleFilter(user) },
        include: {
          trainer: { include: { user: { select: { displayName: true } } } },
          student: { include: { user: { select: { displayName: true } } } },
        },
      });
      return listed(
        rows.map((r) => ({
          id: r.id,
          trainerId: r.trainerId,
          studentId: r.studentId,
          counterpart: user.studentProfile ? r.trainer.user.displayName : r.student.user.displayName,
          status: r.status === 'PENDING' && r.expiresAt <= at ? 'EXPIRED' : r.status,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
        })),
        limit,
      );
    });
  }
  @Get('links')
  links(@Actor() who: Identity, @Query() raw: unknown) {
    const { limit, after } = input(page, raw);
    return this.ops.read(who, async (tx, user) => {
      const q = cursorPage(limit, after);
      const rows = await tx.trainerStudentLink.findMany({
        ...q,
        where: { ...q.where, ...roleFilter(user) },
        include: {
          trainer: { select: { user: { select: { displayName: true } } } },
          student: { select: { user: { select: { displayName: true } } } },
        },
      });
      return listed(
        rows.map((r) => ({
          id: r.id,
          trainerId: r.trainerId,
          studentId: r.studentId,
          status: r.status,
          counterpart: user.studentProfile
            ? r.trainer.user.displayName
            : r.status === 'ACTIVE'
              ? r.student.user.displayName
              : null,
          startedAt: r.startedAt,
          endedAt: r.endedAt,
          endReason: r.endReason,
        })),
        limit,
      );
    });
  }
  @Post('link-requests/:id/accept')
  @HttpCode(200)
  accept(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    const requestId = input(uuid, id),
      body = input(acceptance, raw);
    return this.ops.write(
      who,
      key,
      'links.accept',
      { requestId, ...body },
      async (tx, actor, operationId) => {
        const user = active(actor),
          recipient = student(user);
        await lock(tx, 'student:' + recipient.id);
        const request = await tx.linkRequest.findFirst({
          where: { id: requestId, studentId: recipient.id },
          include: { trainer: { select: { userId: true } } },
        });
        if (!request) return hidden();
        await lock(tx, 'trainer:' + request.trainerId);
        const at = await instantNow(tx);
        if (request.status === 'EXPIRED' || (request.status === 'PENDING' && request.expiresAt <= at))
          fail(410, 'REQUEST_EXPIRED', 'O convite venceu.');
        if (request.status !== 'PENDING') conflict('REQUEST_CLOSED', 'O convite já foi resolvido.');
        const target = await tx.user.findUniqueOrThrow({ where: { id: request.trainer.userId } });
        if (target.accountStatus !== 'ACTIVE') conflict('TRAINER_UNAVAILABLE', 'Personal indisponível.');
        const old = await tx.trainerStudentLink.findFirst({
          where: { studentId: recipient.id, status: 'ACTIVE' },
        });
        if ((old?.id ?? null) !== body.expectedActiveLinkId)
          conflict('LINK_CHANGED', 'Revise e confirme o vínculo que será substituído.');
        if (old?.trainerId === request.trainerId) conflict('ALREADY_LINKED', 'Este vínculo já existe.');
        await requireCapacity(tx, request.trainerId, at);
        const linkId = randomUUID();
        if (old) await endLink(tx, old, user, at, operationId, 'REPLACED', linkId);
        await tx.trainerStudentLink.create({
          data: {
            id: linkId,
            originRequestId: request.id,
            studentId: recipient.id,
            trainerId: request.trainerId,
            startedAt: at,
          },
        });
        await tx.consentRecord.create({
          data: {
            linkId,
            actorUserId: user.id,
            relatedRequestId: request.id,
            decision: 'GRANTED',
            purpose: notice.purpose,
            scopeVersion: notice.scope,
            noticeVersion: body.noticeVersion,
            createdAt: at,
          },
        });
        const resolution = { resolvedAt: at, recordRevision: { increment: 1 } };
        await tx.linkRequest.update({
          where: { id: request.id },
          data: { status: 'ACCEPTED', ...resolution },
        });
        if (old) {
          await tx.linkRequest.updateMany({
            where: { studentId: recipient.id, status: 'PENDING', expiresAt: { lte: at } },
            data: { status: 'EXPIRED', ...resolution },
          });
          await tx.linkRequest.updateMany({
            where: { studentId: recipient.id, status: 'PENDING' },
            data: { status: 'UNAVAILABLE', ...resolution },
          });
        }
        const subjects = [request.trainer.userId];
        if (old)
          subjects.push(
            (await tx.trainerProfile.findUniqueOrThrow({ where: { id: old.trainerId } })).userId,
          );
        return { receipt: { linkId }, subjects };
      },
    );
  }
  @Post('link-requests/:id/decline')
  @HttpCode(200)
  decline(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    return this.resolveInvite(who, key, id, raw, 'DECLINED');
  }
  @Post('link-requests/:id/cancel')
  @HttpCode(200)
  cancel(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    return this.resolveInvite(who, key, id, raw, 'CANCELLED');
  }
  private resolveInvite(
    who: Identity,
    key: string,
    id: string,
    raw: unknown,
    status: 'DECLINED' | 'CANCELLED',
  ) {
    const requestId = input(uuid, id);
    input(noFields, raw ?? {});
    return this.ops.write(who, key, 'links.' + status.toLowerCase(), { requestId }, async (tx, actor) => {
      const user = active(actor);
      const owner =
        status === 'DECLINED' ? { studentId: student(user).id } : { trainerId: trainer(user).id };
      const query = { id: requestId, ...owner };
      const initial = await tx.linkRequest.findFirst({ where: query });
      if (!initial) return hidden();
      await lock(tx, 'student:' + initial.studentId);
      const request = await tx.linkRequest.findFirstOrThrow({ where: query });
      const at = await instantNow(tx);
      if (request.status === 'EXPIRED' || (request.status === 'PENDING' && request.expiresAt <= at))
        fail(410, 'REQUEST_EXPIRED', 'O convite venceu.');
      if (request.status !== 'PENDING') conflict('REQUEST_CLOSED', 'O convite já foi resolvido.');
      await tx.linkRequest.update({
        where: { id: requestId },
        data: { status, resolvedAt: at, recordRevision: { increment: 1 } },
      });
      return { receipt: { id: requestId, status } };
    });
  }
  @Post('links/:id/end')
  @HttpCode(200)
  end(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    return this.close(who, key, id, raw, false);
  }
  @Post('links/:id/revoke')
  @HttpCode(200)
  revoke(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    return this.close(who, key, id, raw, true);
  }
  private close(who: Identity, key: string, id: string, raw: unknown, revoke: boolean) {
    const linkId = input(uuid, id);
    input(noFields, raw ?? {});
    return this.ops.write(
      who,
      key,
      revoke ? 'links.revoke' : 'links.end',
      { linkId },
      async (tx, actor, operationId) => {
        const user = active(actor);
        if (revoke) student(user);
        const query = { id: linkId, ...roleFilter(user) };
        const initial = await tx.trainerStudentLink.findFirst({ where: query });
        if (!initial) return hidden();
        await lock(tx, 'student:' + initial.studentId);
        const link = await tx.trainerStudentLink.findFirstOrThrow({
          where: query,
          include: { student: { select: { userId: true } }, trainer: { select: { userId: true } } },
        });
        if (link.status !== 'ACTIVE') conflict('LINK_CLOSED', 'O vínculo já foi encerrado.');
        const reason = revoke ? 'STUDENT_REVOKED' : user.studentProfile ? 'STUDENT_ENDED' : 'TRAINER_ENDED';
        await endLink(tx, link, user, await instantNow(tx), operationId, reason);
        return {
          receipt: { linkId, status: 'ENDED' },
          subjects: [link.student.userId, link.trainer.userId],
        };
      },
    );
  }
}
@Module({ controllers: [LinksController] })
export class LinksModule {}
