import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [RealtimeModule],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
