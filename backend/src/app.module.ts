import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { TripsModule } from './trips/trips.module';
import { MembersModule } from './members/members.module';
import { LedgerModule } from './ledger/ledger.module';
import { SettlementsModule } from './settlements/settlements.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        level:
          process.env.LOG_LEVEL ??
          (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
        genReqId: (req) => req.id ?? randomUUID(),
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
          ],
          censor: '[REDACTED]',
        },
        autoLogging:
          process.env.NODE_ENV === 'test'
            ? false
            : {
                ignore: (req) => req.url?.startsWith('/health') ?? false,
              },
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
      {
        name: 'auth',
        ttl: 60_000,
        limit: 5,
        // Brute-force protection on auth endpoints in production only.
        skipIf: (context) =>
          process.env.NODE_ENV !== 'production' ||
          context.getClass().name !== 'AuthController',
      },
    ]),
    PrismaModule,
    HealthModule,
    EventsModule,
    AuthModule,
    TripsModule,
    MembersModule,
    LedgerModule,
    SettlementsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
