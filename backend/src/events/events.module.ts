import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { EventsRepository } from './events.repository';

@Module({
  imports: [PrismaModule],
  providers: [EventsRepository],
  exports: [EventsRepository],
})
export class EventsModule {}
