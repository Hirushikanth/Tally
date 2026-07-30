import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsRepository } from './events.repository';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [EventsController],
  providers: [EventsService, EventsRepository],
  exports: [EventsService, EventsRepository],
})
export class EventsModule {}
