import { Body, Controller, Get, Headers, HttpCode, Module, Post } from '@nestjs/common';
import { registration, notice } from '../../../packages/contracts/src/index.js';
import { Actor, Operations, conflict, input, instantNow, lock, principal } from './core.js';
import type { Identity, User } from './core.js';
import { canonicalFree } from './entitlements.js';

function profile(u: User) {
  return {
    id: u.id,
    role: u.role,
    displayName: u.displayName,
    profileId: (u.studentProfile ?? u.trainerProfile)!.id,
    ...(u.studentProfile ? { studentCode: u.studentProfile.shareCode } : {}),
  };
}
@Controller()
class IdentityController {
  constructor(private readonly ops: Operations) {}
  @Get('consent-notice') notice() {
    return notice;
  }
  @Get('me') me(@Actor() who: Identity) {
    return this.ops.read(who, async (_tx, user) => profile(user));
  }
  @Post('me')
  @HttpCode(200)
  register(@Actor() who: Identity, @Headers('idempotency-key') key: string, @Body() raw: unknown) {
    const data = input(registration, raw);
    return this.ops.write(
      who,
      key,
      'profile.register',
      data,
      async (tx, _user, operationId) => {
        await lock(tx, 'identity:' + who.subject);
        await lock(tx, 'email:' + who.email);
        const current = await principal(tx, who);
        if (current) {
          if (current.role !== data.role || current.displayName !== data.displayName)
            conflict('PROFILE_EXISTS', 'A conta já foi cadastrada com outros dados.');
          return { receipt: { id: current.id } };
        }
        if (await tx.user.findUnique({ where: { emailNormalized: who.email } }))
          conflict('PROFILE_EXISTS', 'Não foi possível associar esta identidade.');
        const user = await tx.user.create({
          data: { authSubject: who.subject, emailNormalized: who.email, ...data },
        });
        if (data.role === 'STUDENT') await tx.studentProfile.create({ data: { userId: user.id } });
        else {
          const at = await instantNow(tx);
          const plan = await canonicalFree(tx, at);
          const trainer = await tx.trainerProfile.create({ data: { userId: user.id } });
          const sub = await tx.subscription.create({
            data: { trainerId: trainer.id, planId: plan.id, status: 'ACTIVE', startedAt: at },
          });
          await tx.subscriptionEvent.create({
            data: { subscriptionId: sub.id, sequence: 1, operationId, eventType: 'FREE_ACTIVATED' },
          });
        }
        return { receipt: { id: user.id }, subjects: [user.id] };
      },
      true,
    );
  }
}
@Module({ controllers: [IdentityController] })
export class IdentityModule {}
