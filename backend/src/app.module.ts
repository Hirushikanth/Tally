import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { TripsModule } from './trips/trips.module';
import { MembersModule } from './members/members.module';
import { LedgerModule } from './ledger/ledger.module';
import { SettlementsModule } from './settlements/settlements.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
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
  ],
})
export class AppModule {}
