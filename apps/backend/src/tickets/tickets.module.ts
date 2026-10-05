import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalRecordingStorage } from '../recordings/recording-storage';
import { RealtimeModule } from '../realtime/realtime.module';
import { ATTACHMENT_STORAGE, TicketAttachmentsController, TicketAttachmentsService } from './ticket-attachments';
import { TicketAutomationService } from './ticket-automation';
import { TicketDocumentsController, TicketDocumentsService } from './ticket-documents';
import { TicketParticipantsController, TicketParticipantsService } from './ticket-participants';
import { TicketTasksController, TicketTasksService } from './ticket-tasks';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [RealtimeModule],
  controllers: [TicketsController, TicketTasksController, TicketDocumentsController, TicketParticipantsController, TicketAttachmentsController],
  providers: [
    TicketsService,
    TicketTasksService,
    TicketDocumentsService,
    TicketParticipantsService,
    TicketAutomationService,
    TicketAttachmentsService,
    {
      // Murojaat fayllari: lokal papka yoki NAS (ishlab chiqarishda tarmoq diski ulanadi)
      provide: ATTACHMENT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new LocalRecordingStorage(config.get<string>('ATTACHMENTS_DIR') ?? 'storage/attachments'),
    },
  ],
  exports: [TicketsService],
})
export class TicketsModule {}
