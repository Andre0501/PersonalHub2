import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Headers, HttpCode, Module, Param, Post, Put, Query } from '@nestjs/common';
import {
  draftEdit,
  exerciseInput,
  noFields,
  page,
  planContent,
  revisionCheck,
  uuid,
} from '../../../packages/contracts/src/index.js';
import type { PlanContent } from '../../../packages/contracts/src/index.js';
import { calendarLink, readStudent } from './access.js';
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
  trainer,
} from './core.js';
import type { Identity, Tx, User } from './core.js';
import { effectivePlan } from './entitlements.js';
import { ExecutionController } from './executions.js';

async function catalog(tx: Tx, trainerId: string, content: PlanContent) {
  const ids = [...new Set(content.exercises.map((e) => e.exerciseId))];
  const rows = await tx.exercise.findMany({ where: { trainerId, status: 'ACTIVE', id: { in: ids } } });
  if (rows.length !== ids.length)
    conflict('INVALID_EXERCISE', 'Escolha exercícios ativos do seu catálogo.');
  return new Map(rows.map((e) => [e.id, e]));
}
async function editablePlan(tx: Tx, user: User, planId: string) {
  const owner = trainer(user);
  const plan = await tx.workoutPlan.findFirst({
    where: { id: planId, trainerId: owner.id, status: 'ACTIVE' },
  });
  if (!plan) return hidden();
  await calendarLink(tx, user, plan.originLinkId, true);
  await lock(tx, 'trainer:' + owner.id);
  await effectivePlan(tx, owner.id, await instantNow(tx));
  return plan;
}
@Controller()
class TrainingController {
  constructor(private readonly ops: Operations) {}
  @Post('exercises')
  @HttpCode(201)
  exercise(@Actor() who: Identity, @Headers('idempotency-key') key: string, @Body() raw: unknown) {
    const data = input(exerciseInput, raw);
    return this.ops.write(who, key, 'training.exercise', data, async (tx, actor) => {
      const owner = trainer(active(actor));
      await lock(tx, 'trainer:' + owner.id);
      await effectivePlan(tx, owner.id, await instantNow(tx));
      const row = await tx.exercise.create({
        data: {
          ...data,
          trainerId: owner.id,
          nameNormalized: data.name.normalize('NFKC').toLocaleLowerCase('pt-BR'),
        },
      });
      return { receipt: { id: row.id } };
    });
  }
  @Get('exercises')
  exercises(@Actor() who: Identity, @Query() raw: unknown) {
    const { limit, after } = input(page, raw);
    return this.ops.read(who, async (tx, user) => {
      const q = cursorPage(limit, after);
      return listed(
        await tx.exercise.findMany({
          ...q,
          where: { ...q.where, trainerId: trainer(user).id, status: 'ACTIVE' },
          select: { id: true, name: true, description: true, exerciseType: true },
        }),
        limit,
      );
    });
  }
  @Post('links/:id/plans')
  @HttpCode(201)
  create(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    const linkId = input(uuid, id),
      content = input(planContent, raw);
    return this.ops.write(who, key, 'training.create', { linkId, content }, async (tx, actor) => {
      const user = active(actor),
        owner = trainer(user),
        link = await calendarLink(tx, user, linkId, true);
      await lock(tx, 'trainer:' + owner.id);
      await effectivePlan(tx, owner.id, await instantNow(tx));
      await catalog(tx, owner.id, content);
      const plan = await tx.workoutPlan.create({
        data: {
          originLinkId: linkId,
          studentId: link.studentId,
          trainerId: owner.id,
          title: content.title,
        },
      });
      await tx.workoutPlanDraft.create({ data: { planId: plan.id, draftContent: content } });
      return { receipt: { id: plan.id, revision: 1 } };
    });
  }
  @Get('links/:id/drafts')
  drafts(@Actor() who: Identity, @Param('id') id: string, @Query() raw: unknown) {
    const linkId = input(uuid, id),
      { limit, after } = input(page, raw);
    return this.ops.read(who, async (tx, user) => {
      trainer(user);
      await calendarLink(tx, user, linkId, true);
      const q = cursorPage(limit, after);
      return listed(
        await tx.workoutPlanDraft.findMany({
          ...q,
          where: { ...q.where, plan: { originLinkId: linkId, trainerId: trainer(user).id } },
          select: { id: true, planId: true, draftContent: true, draftRevision: true, baseVersionId: true },
        }),
        limit,
      );
    });
  }
  @Put('plans/:id/draft')
  @HttpCode(200)
  edit(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    const planId = input(uuid, id),
      data = input(draftEdit, raw);
    return this.ops.write(who, key, 'training.edit', { planId, ...data }, async (tx, actor) => {
      const plan = await editablePlan(tx, active(actor), planId);
      await catalog(tx, plan.trainerId, data.content);
      const updated = await tx.workoutPlanDraft.updateMany({
        where: { planId, draftRevision: data.expectedRevision },
        data: { draftContent: data.content, draftRevision: { increment: 1 } },
      });
      if (!updated.count) conflict('REVISION_CONFLICT', 'Releia o rascunho atual.');
      return { receipt: { id: planId, revision: data.expectedRevision + 1 } };
    });
  }
  @Post('plans/:id/publish')
  @HttpCode(201)
  publish(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    const planId = input(uuid, id),
      data = input(revisionCheck, raw);
    return this.ops.write(who, key, 'training.publish', { planId, ...data }, async (tx, actor) => {
      const plan = await editablePlan(tx, active(actor), planId);
      const draft = await tx.workoutPlanDraft.findUniqueOrThrow({ where: { planId } });
      if (draft.draftRevision !== data.expectedRevision)
        conflict('REVISION_CONFLICT', 'Releia o rascunho atual.');
      const content = input(planContent, draft.draftContent),
        entries = await catalog(tx, plan.trainerId, content);
      const previous = await tx.workoutPlanVersion.aggregate({
        where: { planId },
        _max: { versionNumber: true },
      });
      const versionNumber = (previous._max.versionNumber ?? 0) + 1;
      const exercises = content.exercises.map((item, i) => {
        const e = entries.get(item.exerciseId)!;
        return {
          id: randomUUID(),
          sourceExerciseId: e.id,
          name: e.name,
          description: e.description,
          exerciseType: e.exerciseType,
          instructions: item.instructions ?? null,
          position: i + 1,
          sets: item.sets.map((s, j) => ({ ...s, id: randomUUID(), position: j + 1 })),
        };
      });
      const snapshot = { title: content.title, instructions: content.instructions ?? null, exercises };
      const version = await tx.workoutPlanVersion.create({
        data: { planId, versionNumber, title: content.title, instructions: content.instructions, snapshot },
      });
      await tx.prescribedExercise.createMany({
        data: exercises.map((e) => ({
          id: e.id,
          planVersionId: version.id,
          sourceExerciseId: e.sourceExerciseId,
          position: e.position,
          nameSnapshot: e.name,
          descriptionSnapshot: e.description,
          instructions: e.instructions,
        })),
      });
      await tx.prescribedSet.createMany({
        data: exercises.flatMap((e) =>
          e.sets.map((s) => ({
            id: s.id,
            prescribedExerciseId: e.id,
            position: s.position,
            targetReps: s.reps,
            targetLoadKg: s.loadKg,
            targetSeconds: s.seconds,
            targetMeters: s.meters,
          })),
        ),
      });
      await tx.workoutPlanDraft.update({
        where: { planId },
        data: { baseVersionId: version.id, draftRevision: { increment: 1 } },
      });
      return {
        receipt: { id: version.id, version: versionNumber, draftRevision: data.expectedRevision + 1 },
        subjects: [(await tx.studentProfile.findUniqueOrThrow({ where: { id: plan.studentId } })).userId],
      };
    });
  }
  @Get('students/:id/workouts')
  versions(@Actor() who: Identity, @Param('id') id: string, @Query() raw: unknown) {
    const studentId = input(uuid, id),
      { limit, after } = input(page, raw);
    return this.ops.read(who, async (tx, user) => {
      await readStudent(tx, user, studentId);
      const q = cursorPage(limit, after);
      return listed(
        await tx.workoutPlanVersion.findMany({
          ...q,
          where: { ...q.where, plan: { studentId } },
          select: { id: true, planId: true, versionNumber: true, title: true, publishedAt: true },
        }),
        limit,
      );
    });
  }
  @Get('workout-versions/:id')
  version(@Actor() who: Identity, @Param('id') id: string) {
    const versionId = input(uuid, id);
    return this.ops.read(who, async (tx, user) => {
      const version = await tx.workoutPlanVersion.findUnique({
        where: { id: versionId },
        include: { plan: { select: { studentId: true } } },
      });
      if (!version) return hidden();
      await readStudent(tx, user, version.plan.studentId);
      return {
        id: version.id,
        planId: version.planId,
        versionNumber: version.versionNumber,
        snapshot: version.snapshot,
      };
    });
  }
  @Post('workout-versions/:id/executions')
  @HttpCode(201)
  start(
    @Actor() who: Identity,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    const versionId = input(uuid, id);
    input(noFields, raw ?? {});
    return this.ops.write(who, key, 'training.start', { versionId }, async (tx, actor) => {
      const owner = student(active(actor));
      const v = await tx.workoutPlanVersion.findFirst({
        where: { id: versionId, plan: { studentId: owner.id } },
        include: { exercises: { include: { sets: true } } },
      });
      if (!v) return hidden();
      const execution = await tx.workoutExecution.create({
        data: { planVersionId: v.id, studentId: owner.id, startedAt: await instantNow(tx) },
      });
      const exercises = v.exercises.map((e) => ({
        id: randomUUID(),
        prescribedExerciseId: e.id,
        executionId: execution.id,
        sets: e.sets,
      }));
      await tx.exerciseExecution.createMany({
        data: exercises.map((e) => ({
          id: e.id,
          prescribedExerciseId: e.prescribedExerciseId,
          executionId: e.executionId,
        })),
      });
      await tx.setExecution.createMany({
        data: exercises.flatMap((e) =>
          e.sets.map((s) => ({ exerciseExecutionId: e.id, prescribedSetId: s.id })),
        ),
      });
      return { receipt: { id: execution.id, revision: 1 } };
    });
  }
}
@Module({ controllers: [TrainingController, ExecutionController] })
export class TrainingModule {}
