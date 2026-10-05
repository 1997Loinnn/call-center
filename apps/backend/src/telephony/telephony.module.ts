import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingModule } from '../billing/billing.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { BlacklistController, BlacklistService } from './blacklist';
import { CallbacksController, CallbacksService } from './call-lists';
import { MockPbxAdapter } from './mock-pbx.adapter';
import { PBX_ADAPTER, PbxAdapter } from './pbx-adapter';
import { TelephonyController } from './telephony.controller';
import { TelephonyService } from './telephony.service';
import { Ucm6510Adapter } from './ucm6510.adapter';

@Module({
  imports: [RealtimeModule, RecordingsModule, BillingModule],
  controllers: [TelephonyController, BlacklistController, CallbacksController],
  providers: [
    {
      provide: PBX_ADAPTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PbxAdapter => {
        if (config.get<string>('PBX_DRIVER') === 'ucm6510') {
          return new Ucm6510Adapter({
            baseUrl: config.getOrThrow<string>('UCM_BASE_URL'),
            user: config.getOrThrow<string>('UCM_API_USER'),
            password: config.getOrThrow<string>('UCM_API_PASSWORD'),
          });
        }
        return new MockPbxAdapter({ simulateQueue: config.get<string>('MOCK_QUEUE_SIMULATION') !== 'false' });
      },
    },
    TelephonyService,
    BlacklistService,
    CallbacksService,
  ],
  exports: [PBX_ADAPTER, TelephonyService, BlacklistService],
})
export class TelephonyModule {}
