import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { MailMessage, sendMail, SmtpOptions } from '../common/smtp';
import { TelegramClient, TgUpdate } from '../omni/telegram';

export type ChannelState = 'connected' | 'error' | 'off';

/** Maxfiy kalitni vaqtga bog'liq bo'lmagan usulda solishtirish. */
export function sameSecret(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Telegram bot (F-OMNI-01). TELEGRAM_BOT_TOKEN berilsa ishga tushadi:
 * TELEGRAM_WEBHOOK_URL bo'lsa — webhook, aks holda long polling (ichki tarmoqdan chiquvchi ulanish yetarli).
 */
@Injectable()
export class TelegramBot implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('TelegramBot');
  readonly client: TelegramClient | null;
  private readonly webhookUrl?: string;
  private readonly webhookSecret?: string;
  private handler: ((update: TgUpdate) => Promise<void>) | null = null;
  private abort = new AbortController();
  private stopped = false;
  username: string | null = null;
  lastError: string | null = null;
  mode: 'off' | 'polling' | 'webhook' = 'off';

  constructor(config: ConfigService) {
    const token = config.get<string>('TELEGRAM_BOT_TOKEN');
    this.client = token ? new TelegramClient(token, config.get<string>('TELEGRAM_API_URL') ?? undefined) : null;
    this.webhookUrl = config.get<string>('TELEGRAM_WEBHOOK_URL') || undefined;
    this.webhookSecret = config.get<string>('TELEGRAM_WEBHOOK_SECRET') || undefined;
  }

  onUpdate(handler: (update: TgUpdate) => Promise<void>): void {
    this.handler = handler;
  }

  onModuleInit(): void {
    if (!this.client) return;
    // Ishga tushishni to'xtatmaymiz: internet bo'lmasa ham backend ishlaydi, bot qayta urinadi
    void this.run();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    this.abort.abort();
  }

  private async run(): Promise<void> {
    const client = this.client!;
    while (!this.stopped && !this.username) {
      try {
        this.username = (await client.getMe()).username ?? null;
        if (this.webhookUrl && this.webhookSecret) {
          await client.setWebhook(this.webhookUrl, this.webhookSecret);
          this.mode = 'webhook';
        } else {
          await client.deleteWebhook();
          this.mode = 'polling';
        }
        this.lastError = null;
        this.logger.log(`Telegram bot ulandi: @${this.username} (${this.mode})`);
      } catch (err) {
        this.fail(err);
        await this.sleep(30_000);
      }
    }
    if (this.mode !== 'polling') return;
    let offset = 0;
    while (!this.stopped) {
      try {
        const updates = await client.getUpdates(offset, this.abort.signal);
        for (const update of updates) {
          offset = update.update_id + 1;
          await this.dispatch(update);
        }
        this.lastError = null;
      } catch (err) {
        if (this.stopped) return;
        this.fail(err);
        await this.sleep(5_000);
      }
    }
  }

  /** Webhook: Telegram "X-Telegram-Bot-Api-Secret-Token" sarlavhasi bilan yuboradi. */
  async handleWebhook(secret: string | undefined, update: TgUpdate): Promise<boolean> {
    if (this.mode !== 'webhook' || !sameSecret(secret, this.webhookSecret)) return false;
    await this.dispatch(update);
    return true;
  }

  private async dispatch(update: TgUpdate): Promise<void> {
    try {
      await this.handler?.(update);
    } catch (err) {
      this.logger.error(`Telegram xabari qayta ishlanmadi (update ${update.update_id})`, err instanceof Error ? err.stack : String(err));
    }
  }

  private fail(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    if (message !== this.lastError) this.logger.warn(message);
    this.lastError = message;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms).unref());
  }

  state(): ChannelState {
    if (!this.client) return 'off';
    return this.username && !this.lastError ? 'connected' : 'error';
  }
}

/**
 * Email kanali (F-OMNI-03): kiruvchi xatlar pochta serveridan /api/public/email/inbound ga keladi
 * (EMAIL_INBOUND_SECRET bilan), javoblar SMTP orqali yuboriladi.
 */
@Injectable()
export class EmailChannel {
  readonly smtp: SmtpOptions | null;
  readonly inboundSecret?: string;
  /** Murojaat qabul qilinadigan pochta qutisi (sahifada ko'rsatish uchun) */
  readonly address: string | null;
  lastError: string | null = null;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const from = config.get<string>('SMTP_FROM');
    this.smtp =
      host && from
        ? {
            host,
            port: Number(config.get<string>('SMTP_PORT') ?? 587),
            secure: config.get<string>('SMTP_SECURE') === 'true',
            user: config.get<string>('SMTP_USER') || undefined,
            password: config.get<string>('SMTP_PASSWORD') || undefined,
            from,
          }
        : null;
    this.inboundSecret = config.get<string>('EMAIL_INBOUND_SECRET') || undefined;
    this.address = from ? (/<([^>]+)>/.exec(from)?.[1] ?? from) : null;
  }

  async send(mail: MailMessage): Promise<string> {
    if (!this.smtp) throw new Error('SMTP sozlanmagan');
    try {
      const id = await sendMail(this.smtp, mail);
      this.lastError = null;
      return id;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  state(): { inbound: ChannelState; outbound: ChannelState } {
    return { inbound: this.inboundSecret ? 'connected' : 'off', outbound: !this.smtp ? 'off' : this.lastError ? 'error' : 'connected' };
  }
}
