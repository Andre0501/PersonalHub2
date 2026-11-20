import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory, APP_GUARD } from '@nestjs/core';
import { SafeErrors } from './errors.js';
import { CoreModule, Db, setting } from './core.js';
import { IdentityModule } from './identity.js';
import { LinksModule } from './links.js';
import { ProgressModule } from './progress.js';
import { TrainingModule } from './training.js';
import { AgendaModule } from './agenda.js';
import { PublicRoute, SupabaseGuard } from './auth.js';

@Controller('health')
class HealthController {
  constructor(private readonly db: Db) {}
  @Get() @PublicRoute() async health() {
    await this.db.$queryRaw`SELECT 1::int AS ok`;
    return { status: 'ok' };
  }
}
@Module({
  imports: [CoreModule, IdentityModule, LinksModule, ProgressModule, AgendaModule, TrainingModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: SupabaseGuard }],
})
class AppModule {}
export async function createApp(quiet = false) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: quiet ? false : ['warn', 'error', 'log'],
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: '32kb' });
  app.useGlobalFilters(new SafeErrors());
  app.setGlobalPrefix('v1');
  app.enableCors({
    origin: setting('WEB_ORIGIN'),
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS'],
  });
  app.use((_req: unknown, res: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  return app;
}
