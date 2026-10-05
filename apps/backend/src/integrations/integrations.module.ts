import { Body, Controller, Global, HttpCode, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { DataCipher } from '../common/crypto';
import { Public } from '../common/decorators';
import { RealtimeModule } from '../realtime/realtime.module';
import { EmailChannel, TelegramBot } from './channels';
import { NotificationsService } from './notifications.service';
import { SmsService } from './sms';

/** SMS provayderining yetkazish holati (callback_url ichidagi maxfiy kalit bilan). */
@ApiTags('public')
@Public()
@Controller('public/sms')
export class SmsCallbackController {
  constructor(private readonly sms: SmsService) {}

  @Post('callback/:secret')
  @HttpCode(200)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async callback(@Param('secret') secret: string, @Body() body: Record<string, unknown>) {
    if (!(await this.sms.handleCallback(secret, body ?? {}))) throw new NotFoundException();
    return { ok: true };
  }
}

/**
 * Tashqi kanallar (Telegram bot, pochta, SMS shlyuzi), xodimlarga bildirishnomalar va ma'lumot shifrlash — bitta nusxa:
 * omnikanal, murojaatlar avtomatikasi, ogohlantirishlar va hisobotlar shu orqali yuboradi.
 */
@Global()
@Module({
  imports: [RealtimeModule],
  controllers: [SmsCallbackController],
  providers: [
    TelegramBot,
    EmailChannel,
    SmsService,
    NotificationsService,
    {
      provide: DataCipher,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new DataCipher(config.get<string>('DATA_ENCRYPTION_KEY') || undefined, config.getOrThrow<string>('JWT_SECRET')),
    },
  ],
  exports: [TelegramBot, EmailChannel, SmsService, NotificationsService, DataCipher],
})
export class IntegrationsModule {}
