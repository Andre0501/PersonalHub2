import { conflict, fail } from './core.js';
import type { Tx } from './core.js';
export async function canonicalFree(tx: Tx, at: Date) {
  const offers = await tx.subscriptionPlan.findMany({
    where: {
      status: 'ACTIVE',
      canonicalFree: true,
      effectiveFrom: { lte: at },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
    },
    take: 2,
  });
  if (offers.length !== 1) fail(503, 'FREE_UNAVAILABLE', 'Oferta de entrada indisponível.');
  return offers[0];
}
export async function effectivePlan(tx: Tx, trainerId: string, at: Date) {
  const subscription = await tx.subscription.findFirst({
    where: { trainerId, isCurrent: true },
    include: { plan: true },
  });
  if (!subscription) fail(503, 'SUBSCRIPTION_UNAVAILABLE', 'Assinatura indisponível.');
  if (subscription.status === 'SUSPENDED')
    fail(403, 'SUBSCRIPTION_SUSPENDED', 'Operação profissional suspensa.');
  return subscription.status === 'PAST_DUE' ? canonicalFree(tx, at) : subscription.plan;
}
export async function requireCapacity(tx: Tx, trainerId: string, at: Date) {
  const plan = await effectivePlan(tx, trainerId, at);
  const capacity = await tx.planEntitlement.findUnique({
    where: {
      planId_featureCode: { planId: plan.id, featureCode: 'ACTIVE_STUDENTS' },
    },
  });
  if (capacity?.integerValue == null)
    fail(503, 'ENTITLEMENT_UNAVAILABLE', 'Limite de alunos indisponível.');
  const count = await tx.trainerStudentLink.count({ where: { trainerId, status: 'ACTIVE' } });
  if (count >= capacity.integerValue)
    conflict('CAPACITY_REACHED', 'O personal atingiu o limite de alunos ativos.');
}
