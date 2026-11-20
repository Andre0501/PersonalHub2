import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { executionCorrection, executionFinish, page, uuid } from '../../../packages/contracts/src/index.js';
import type { ActualSet } from '../../../packages/contracts/src/index.js';
import { readStudent } from './access.js';
import {
  Actor,
  Operations,
  active,
  conflict,
  cursorPage,
  hidden,
  input,
  instantNow,
  listed,
  lock,
  student,
} from './core.js';
import type { WorkoutExecution } from '@prisma/client';
import type { Identity, Tx } from './core.js';

async function executionDetails(tx: Tx, row: WorkoutExecution) {
  const version = await tx.workoutPlanVersion.findUniqueOrThrow({
    where: { id: row.planVersionId },
    select: { snapshot: true },
  });
  const exercises = await tx.exerciseExecution.findMany({
    where: { executionId: row.id },
    include: { prescription: true },
  });
  const sets = await tx.setExecution.findMany({
    where: { exerciseExecutionId: { in: exercises.map((e) => e.id) } },
    include: { prescription: true },
  });
  const byExercise = new Map<string, typeof sets>();
  for (const set of sets) {
    const group = byExercise.get(set.exerciseExecutionId);
    if (group) group.push(set);
    else byExercise.set(set.exerciseExecutionId, [set]);
  }
  return { ...row, version, exercises: exercises.map((e) => ({ ...e, sets: byExercise.get(e.id) ?? [] })) };
}
function exerciseStatus(statuses: string[]) {
  if (statuses.every((s) => s === 'COMPLETED')) return 'COMPLETED';
  if (statuses.every((s) => s === 'SKIPPED')) return 'SKIPPED';
  if (statuses.every((s) => s === 'NOT_STARTED')) return 'NOT_STARTED';
  return 'PARTIAL';
}
@Controller()
export class ExecutionController {
  constructor(private readonly ops: Operations) {}
  @Get('students/:id/executions')
  list(@Actor() who: Identity, @Param('id') id: string, @Query() raw: unknown) {
    const studentId = input(uuid, id),
      { limit, after } = input(page, raw);
    return this.ops.read(who, async (tx, user) => {
      await readStudent(tx, user, studentId);
      const q = cursorPage(limit, after);
      return listed(
        await tx.workoutExecution.findMany({
          ...q,
          where: { ...q.where, studentId },
          select: {
            id: true,
            planVersionId: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            executionRevision: true,
          },
        }),
        limit,
      );
    });
  }
  @Get('executions/:id')
  get(@Actor() who: Identity, @Param('id') id: string) {
    const executionId = input(uuid, id);
    return this.ops.read(who, async (tx, user) => {
      const row = await tx.workoutExecution.findUnique({
        where: { id: executionId },
        select: { studentId: true },
      });
      if (!row) return hidden();
      await readStudent(tx, user, row.studentId);
      await lock(tx, 'execution:' + executionId);
      const e = await executionDetails(
        tx,
        await tx.workoutExecution.findUniqueOrThrow({ where: { id: executionId } }),
      );
      return {
        id: e.id,
        status: e.status,
        executionRevision: e.executionRevision,
        planVersionId: e.planVersionId,
        startedAt: e.startedAt,
        finishedAt: e.finishedAt,
        exercises: e.exercises
          .sort((a, b) => a.prescription.position - b.prescription.position)
          .map((x) => ({
            name: x.prescription.nameSnapshot,
            prescribedExerciseId: x.prescribedExerciseId,
            status: x.status,
            sets: x.sets
              .sort((a, b) => a.prescription.position - b.prescription.position)
              .map((s) => ({
                prescribedSetId: s.prescribedSetId,
                position: s.prescription.position,
                targetReps: s.prescription.targetReps,
                targetLoadKg: s.prescription.targetLoadKg,
                targetSeconds: s.prescription.targetSeconds,
                targetMeters: s.prescription.targetMeters,
                status: s.status,
                reps: s.actualReps,
                loadKg: s.actualLoadKg,
                seconds: s.actualSeconds,
                meters: s.actualMeters,
              })),
          })),
      };
    });
  }
  @Post('executions/:id/finish')
  @HttpCode(200)
  finish(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    const data = input(executionFinish, raw);
    return this.record(who, key, input(uuid, id), data.expectedRevision, data.outcome, data.sets);
  }
  @Post('executions/:id/corrections')
  @HttpCode(200)
  correct(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    const data = input(executionCorrection, raw);
    return this.record(
      who,
      key,
      input(uuid, id),
      data.expectedRevision,
      'COMPLETED',
      data.sets,
      data.reason,
    );
  }
  private record(
    who: Identity,
    key: string,
    id: string,
    expectedRevision: number,
    outcome: string,
    sets: ActualSet[],
    reason?: string,
  ) {
    return this.ops.write(
      who,
      key,
      reason ? 'training.correct' : 'training.finish',
      { id, expectedRevision, outcome, sets, ...(reason ? { reason } : {}) },
      async (tx, actor) => {
        const user = active(actor),
          owner = student(user);
        await lock(tx, 'execution:' + id);
        const row = await tx.workoutExecution.findFirst({ where: { id, studentId: owner.id } });
        if (!row) return hidden();
        const e = await executionDetails(tx, row);
        if (e.executionRevision !== expectedRevision || e.status !== (reason ? 'COMPLETED' : 'IN_PROGRESS'))
          conflict('REVISION_CONFLICT', 'Execução encerrada ou revisão desatualizada.');
        const prescribed = new Set(e.exercises.flatMap((x) => x.sets.map((s) => s.prescribedSetId)));
        const inputs = new Map(sets.map((s) => [s.prescribedSetId, s]));
        if (inputs.size !== sets.length || sets.some((s) => !prescribed.has(s.prescribedSetId)))
          conflict('PRESCRIPTION_MISMATCH', 'Cada série deve pertencer uma vez à versão executada.');
        if (
          outcome === 'COMPLETED' &&
          (inputs.size !== prescribed.size || !sets.some((s) => s.status !== 'SKIPPED'))
        )
          conflict('INCOMPLETE_SETS', 'Informe o resultado de cada série ou abandone a execução.');
        const at = await instantNow(tx);
        const finishedAt = e.finishedAt ?? at;
        const exercises = [];
        for (const x of e.exercises.sort((a, b) => a.prescription.position - b.prescription.position)) {
          const actual = [];
          for (const s of x.sets.sort((a, b) => a.prescription.position - b.prescription.position)) {
            const v = inputs.get(s.prescribedSetId),
              status = v?.status ?? 'NOT_STARTED';
            const m = {
              actualReps: v?.reps ?? null,
              actualLoadKg: v?.loadKg ?? null,
              actualSeconds: v?.seconds ?? null,
              actualMeters: v?.meters ?? null,
            };
            await tx.setExecution.update({ where: { id: s.id }, data: { status, ...m } });
            actual.push({
              id: s.id,
              prescribedSetId: s.prescribedSetId,
              position: s.prescription.position,
              status,
              ...m,
            });
          }
          const status = exerciseStatus(actual.map((s) => s.status));
          await tx.exerciseExecution.update({ where: { id: x.id }, data: { status } });
          exercises.push({
            id: x.id,
            prescribedExerciseId: x.prescribedExerciseId,
            name: x.prescription.nameSnapshot,
            status,
            sets: actual,
          });
        }
        const revId = randomUUID(),
          revision = e.executionRevision + 1;
        const prev = e.currentRevisionId
          ? await tx.workoutRevision.findUniqueOrThrow({ where: { id: e.currentRevisionId } })
          : null;
        const snapshot = {
          executionId: id,
          studentId: owner.id,
          planVersionId: e.planVersionId,
          startedAt: e.startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          status: outcome,
          prescription: e.version.snapshot,
          exercises,
        };
        await tx.workoutRevision.create({
          data: {
            id: revId,
            executionId: id,
            previousRevisionId: e.currentRevisionId,
            revisionNumber: (prev?.revisionNumber ?? 0) + 1,
            snapshot,
            actorUserId: user.id,
            reason: reason ?? null,
            createdAt: at,
          },
        });
        await tx.workoutExecution.update({
          where: { id },
          data: { executionRevision: revision, status: outcome, finishedAt, currentRevisionId: revId },
        });
        return { receipt: { id, revision, status: outcome } };
      },
    );
  }
}
