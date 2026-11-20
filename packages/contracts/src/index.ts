import { z } from 'zod';

export const uuid = z.uuid();
export const instant = z.iso.datetime({ offset: true });
export const roles = z.enum(['TRAINER', 'STUDENT']);
import { notice } from './notice.js';
export { notice };

export const registration = z.strictObject({ role: roles, displayName: z.string().trim().min(2).max(80) });
export const invitation = z.strictObject({ studentCode: uuid });
export const acceptance = z.strictObject({
  consent: z.literal(true),
  noticeVersion: z.literal(notice.version),
  expectedActiveLinkId: uuid.nullable(),
});
export const noFields = z.strictObject({});
const weightValues = {
  kg: z.number().positive().max(9999.99).multipleOf(0.01),
  measuredAt: instant,
  note: z.string().trim().max(500).nullable().optional(),
};
export const weightEntry = z.strictObject(weightValues);
export const weightCorrection = z.strictObject({
  ...weightValues,
  expectedRevision: z.int().positive(),
  reason: z.string().trim().min(1).max(300).optional(),
});
export const invalidation = z.strictObject({
  expectedRevision: z.int().positive(),
  reason: z.string().trim().min(1).max(300),
});
export const booking = z.strictObject({
  startsAt: instant,
  endsAt: instant,
  timezone: z.string().trim().min(1).max(80),
});
export const bookingChange = z.strictObject({ ...booking.shape, expectedRevision: z.int().positive() });
export const bookingDecision = z.strictObject({
  status: z.enum(['COMPLETED', 'CANCELLED', 'NO_SHOW']),
  expectedRevision: z.int().positive(),
});
export const page = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  after: uuid.optional(),
});
export type Registration = z.infer<typeof registration>;
export type Acceptance = z.infer<typeof acceptance>;
export type Weight = z.infer<typeof weightEntry>;
export type Page = z.infer<typeof page>;
export type Booking = z.infer<typeof booking>;

export const exerciseInput = z.strictObject({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  exerciseType: z.enum(['STRENGTH', 'TIME', 'DISTANCE', 'MIXED']),
});
const metrics = {
  reps: z.int().positive().max(10000).optional(),
  loadKg: z.number().nonnegative().max(99999).multipleOf(0.001).optional(),
  seconds: z.int().positive().max(86400).optional(),
  meters: z.number().positive().max(1000000).multipleOf(0.001).optional(),
};
export const planContent = z.strictObject({
  title: z.string().trim().min(2).max(100),
  instructions: z.string().trim().max(1000).optional(),
  exercises: z
    .array(
      z.strictObject({
        exerciseId: uuid,
        instructions: z.string().trim().max(500).optional(),
        sets: z
          .array(z.strictObject(metrics).refine((v) => Object.keys(v).length > 0))
          .min(1)
          .max(12),
      }),
    )
    .min(1)
    .max(12),
});
export const draftEdit = z.strictObject({ expectedRevision: z.int().positive(), content: planContent });
export const revisionCheck = z.strictObject({ expectedRevision: z.int().positive() });
const actualSet = z
  .strictObject({ prescribedSetId: uuid, status: z.enum(['COMPLETED', 'PARTIAL', 'SKIPPED']), ...metrics })
  .refine(
    (v) =>
      (v.status === 'SKIPPED') ===
      (v.reps == null && v.loadKg == null && v.seconds == null && v.meters == null),
  );
export const executionFinish = z.strictObject({
  expectedRevision: z.int().positive(),
  outcome: z.enum(['COMPLETED', 'ABANDONED']),
  sets: z.array(actualSet).max(144),
});
export const executionCorrection = z.strictObject({
  expectedRevision: z.int().positive(),
  reason: z.string().trim().min(1).max(300),
  sets: z.array(actualSet).min(1).max(144),
});
export type PlanContent = z.infer<typeof planContent>;
export type ActualSet = z.infer<typeof actualSet>;
