import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { TripsModule } from './trips/trips.module';
import { MembersModule } from './members/members.module';

@Module({
  imports: [PrismaModule, EventsModule, AuthModule, TripsModule, MembersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
