import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { DomainErrorFilter } from './common/filters/domain-error.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  app.use(helmet({ hsts: nodeEnv === 'production' }));
  app.useBodyParser('json', { limit: '100kb' });

  const corsOrigins = config
    .get<string>('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins });

  // Behind Render's proxy the client IP is only reachable by trusting 1 hop.
  app.set('trust proxy', nodeEnv === 'production' ? 1 : false);

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new DomainErrorFilter());

  app.enableShutdownHooks();
  app.getHttpServer().requestTimeout = 30_000;

  await app.listen(config.getOrThrow<number>('PORT'));
}
void bootstrap();
