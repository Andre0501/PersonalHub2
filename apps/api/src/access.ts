import { hidden, lock } from './core.js';
import type { Tx, User } from './core.js';
import { notice } from '../../../packages/contracts/src/index.js';

export const shared = {
  status: 'ACTIVE',
  consents: {
    some: {
      decision: 'GRANTED',
      purpose: notice.purpose,
      scopeVersion: notice.scope,
      noticeVersion: notice.version,
    },
    none: { decision: 'REVOKED' },
  },
  trainer: { user: { accountStatus: 'ACTIVE' } },
  student: { user: { accountStatus: 'ACTIVE' } },
};
export async function readStudent(tx: Tx, user: User, studentId: string) {
  await lock(tx, 'student:' + studentId);
  if (user.studentProfile?.id === studentId) return;
  const trainerId = user.trainerProfile?.id;
  if (
    !trainerId ||
    !(await tx.trainerStudentLink.findFirst({
      where: { studentId, trainerId, ...shared },
      select: { id: true },
    }))
  )
    hidden();
}
export async function calendarLink(tx: Tx, user: User, id: string, write: boolean) {
  const initial = await tx.trainerStudentLink.findUnique({ where: { id }, select: { studentId: true } });
  if (!initial) return hidden();
  await lock(tx, 'student:' + initial.studentId);
  if (!write && user.studentProfile?.id === initial.studentId)
    return await tx.trainerStudentLink.findUniqueOrThrow({ where: { id } });
  if (!user.trainerProfile) return hidden();
  const link = await tx.trainerStudentLink.findFirst({
    where: { id, trainerId: user.trainerProfile.id, ...shared },
  });
  if (!link) return hidden();
  return link;
}
