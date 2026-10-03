import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalRecordingStorage, RECORDING_STORAGE } from './recording-storage';
import { RecordingsController } from './recordings.controller';
import { RecordingsService } from './recordings.service';

@Module({
  controllers: [RecordingsController],
  providers: [
    {
      provide: RECORDING_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new LocalRecordingStorage(config.get<string>('RECORDINGS_DIR') ?? 'storage/recordings'),
    },
    RecordingsService,
  ],
  exports: [RecordingsService],
})
export class RecordingsModule {}
