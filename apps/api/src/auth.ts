import { Injectable, SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, errors } from 'jose';
import { z } from 'zod';
import { fail, setting } from './core.js';
import { uuid } from '../../../packages/contracts/src/index.js';

const publicRoute = Symbol('publicRoute');
export const PublicRoute = () => SetMetadata(publicRoute, true);
@Injectable()
export class SupabaseGuard implements CanActivate {
  private readonly issuer: string;
  private readonly keys: ReturnType<typeof createRemoteJWKSet>;
  constructor(private readonly reflector: Reflector) {
    const url = new URL(setting('SUPABASE_URL'));
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && process.env.NODE_ENV !== 'production')) {
      throw new Error('O emissor configurado requer HTTPS.');
    }
    this.issuer = url.origin + '/auth/v1';
    this.keys = createRemoteJWKSet(new URL(this.issuer + '/.well-known/jwks.json'));
  }
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    if (this.reflector.get<boolean>(publicRoute, ctx.getHandler())) return true;
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '');
    if (!match) fail(401, 'TOKEN_REQUIRED', 'Entre na sua conta.');
    try {
      const { payload } = await jwtVerify(match[1], this.keys, {
        issuer: this.issuer,
        audience: 'authenticated',
        algorithms: ['ES256', 'RS256'],
        requiredClaims: ['sub', 'exp', 'iat', 'email'],
        clockTolerance: 0,
      });
      if (
        !uuid.safeParse(payload.sub).success ||
        !z.email().safeParse(payload.email).success ||
        payload.role !== 'authenticated' ||
        payload.is_anonymous === true
      )
        throw new Error('identity');
      req.identity = { subject: payload.sub, email: String(payload.email).trim().toLowerCase() };
      return true;
    } catch (err) {
      if (err instanceof errors.JWKSTimeout || err instanceof TypeError)
        fail(503, 'IDENTITY_UNAVAILABLE', 'Verificação de identidade temporariamente indisponível.');
      return fail(401, 'INVALID_TOKEN', 'Sessão inválida ou expirada.');
    }
  }
}
