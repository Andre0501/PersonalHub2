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
  booking,
  bookingChange,
  bookingDecision,
  page,
  uuid,
} from '../../../packages/contracts/src/index.js';
import type { Booking } from '../../../packages/contracts/src/index.js';
import { calendarLink } from './access.js';
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
  trainer,
} from './core.js';
import type { Identity, Tx } from './core.js';
import { effectivePlan } from './entitlements.js';

function interval(data: Booking) {
  const startsAt = new Date(data.startsAt),
    endsAt = new Date(data.endsAt);
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: data.timezone });
  } catch {
    fail(400, 'INVALID_ZONE', 'Fuso horário inválido.');
  }
  if (endsAt <= startsAt) fail(400, 'INVALID_INTERVAL', 'O final precisa ocorrer após o início.');
  return { startsAt, endsAt, timezone: data.timezone };
}
async function available(
  tx: Tx,
  link: { studentId: string; trainerId: string },
  data: ReturnType<typeof interval>,
  except?: string,
) {
  const overlap = await tx.appointment.findFirst({
    where: {
      status: 'SCHEDULED',
      OR: [{ trainerId: link.trainerId }, { studentId: link.studentId }],
      startsAt: { lt: data.endsAt },
      endsAt: { gt: data.startsAt },
      ...(except ? { id: { not: except } } : {}),
    },
    select: { id: true },
  });
  if (overlap) conflict('SCHEDULE_CONFLICT', 'Horário ocupado por um dos participantes.');
}
@Controller()
class AgendaController {
  constructor(private readonly ops: Operations) {}
  @Get('links/:id/appointments')
  list(@Actor() who: Identity, @Param('id') id: string, @Query() raw: unknown) {
    const linkId = input(uuid, id),
      { limit, after } = input(page, raw);
    return this.ops.read(who, async (tx, user) => {
      await calendarLink(tx, user, linkId, false);
      const q = cursorPage(limit, after);
      return listed(
        await tx.appointment.findMany({
          ...q,
          where: { ...q.where, linkId },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            timezone: true,
            status: true,
            statusReason: true,
            recordRevision: true,
          },
        }),
        limit,
      );
    });
  }
  @Post('links/:id/appointments')
  @HttpCode(201)
  create(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    const linkId = input(uuid, id),
      data = input(booking, raw),
      times = interval(data);
    return this.ops.write(who, key, 'agenda.book', { linkId, ...data }, async (tx, actor, operationId) => {
      const user = active(actor);
      trainer(user);
      const link = await calendarLink(tx, user, linkId, true);
      await lock(tx, 'trainer:' + link.trainerId);
      const at = await instantNow(tx);
      await effectivePlan(tx, link.trainerId, at);
      if (times.startsAt < at) fail(400, 'PAST_SLOT', 'Escolha um horário futuro.');
      await available(tx, link, times);
      const appt = await tx.appointment.create({
        data: { linkId, trainerId: link.trainerId, studentId: link.studentId, ...times },
      });
      await tx.appointmentEvent.create({
        data: {
          appointmentId: appt.id,
          sequence: 1,
          operationId,
          eventType: 'CREATED',
          newStatus: 'SCHEDULED',
          details: data,
          createdAt: at,
        },
      });
      return {
        receipt: { id: appt.id, revision: 1 },
        subjects: [(await tx.studentProfile.findUniqueOrThrow({ where: { id: link.studentId } })).userId],
      };
    });
  }
  @Patch('appointments/:id')
  reschedule(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    const data = input(bookingChange, raw);
    return this.update(who, key, input(uuid, id), data.expectedRevision, 'SCHEDULED', data);
  }
  @Post('appointments/:id/resolve')
  @HttpCode(200)
  resolve(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    const data = input(bookingDecision, raw);
    return this.update(who, key, input(uuid, id), data.expectedRevision, data.status);
  }
  private update(
    who: Identity,
    key: string,
    id: string,
    expectedRevision: number,
    status: string,
    edit?: Booking,
  ) {
    const times = edit ? interval(edit) : undefined;
    return this.ops.write(
      who,
      key,
      edit ? 'agenda.reschedule' : 'agenda.resolve',
      { id, expectedRevision, status, ...(edit ?? {}) },
      async (tx, actor, operationId) => {
        const user = active(actor),
          owner = trainer(user);
        const first = await tx.appointment.findFirst({
          where: { id, trainerId: owner.id },
          select: { linkId: true },
        });
        if (!first) return hidden();
        const link = await calendarLink(tx, user, first.linkId, true);
        await lock(tx, 'trainer:' + owner.id);
        const at = await instantNow(tx);
        await effectivePlan(tx, owner.id, at);
        const a = await tx.appointment.findUniqueOrThrow({ where: { id } });
        if (a.status !== 'SCHEDULED' || a.recordRevision !== expectedRevision)
          conflict('REVISION_CONFLICT', 'Sessão encerrada ou alterada.');
        if (times) {
          if (times.startsAt < at) fail(400, 'PAST_SLOT', 'Escolha um horário futuro.');
          await available(tx, link, times, id);
        } else if (status !== 'CANCELLED' && at < a.endsAt)
          conflict('SESSION_NOT_FINISHED', 'A sessão ainda não terminou.');
        const revision = a.recordRevision + 1;
        await tx.appointment.update({
          where: { id },
          data: { ...times, status, recordRevision: revision },
        });
        const details = edit
          ? {
              from: {
                startsAt: a.startsAt.toISOString(),
                endsAt: a.endsAt.toISOString(),
                timezone: a.timezone,
              },
              to: { startsAt: edit.startsAt, endsAt: edit.endsAt, timezone: edit.timezone },
            }
          : undefined;
        await tx.appointmentEvent.create({
          data: {
            appointmentId: id,
            sequence: revision,
            operationId,
            eventType: edit ? 'RESCHEDULED' : status,
            previousStatus: a.status,
            newStatus: status,
            ...(details ? { details } : {}),
            createdAt: at,
          },
        });
        return {
          receipt: { id, revision, status },
          subjects: [(await tx.studentProfile.findUniqueOrThrow({ where: { id: link.studentId } })).userId],
        };
      },
    );
  }
}
@Module({ controllers: [AgendaController] })
export class AgendaModule {}
