import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

type RequestWithId = Request & { id?: string };

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  // Sentry: optional — without SENTRY_DSN error reporting stays disabled.
  const sentryDsn = config.get<string>('SENTRY_DSN');
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: nodeEnv,
      tracesSampleRate: nodeEnv === 'production' ? 0.1 : 1.0,
    });
  }

  app.useLogger(app.get(Logger));

  // Request ID: honor an inbound x-request-id, else generate one; echoed
  // back on the response so clients can correlate logs with requests.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const header = req.headers['x-request-id'];
    const id = (Array.isArray(header) ? header[0] : header) ?? randomUUID();
    (req as RequestWithId).id = id;
    res.setHeader('x-request-id', id);
    next();
  });

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
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();
  app.getHttpServer().requestTimeout = 30_000;

  await app.listen(config.getOrThrow<number>('PORT'));
}
void bootstrap();
