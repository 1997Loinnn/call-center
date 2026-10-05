import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsMessage, SmsStatus } from '@prisma/client';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService, SmsTemplatesSetting } from '../settings/settings.service';
import { sameSecret } from './channels';

/** Shlyuz xatosi: permanent — qayta urinish foyda bermaydi (noto'g'ri raqam, shablon rad etildi). */
export class SmsError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

export interface SmsDriver {
  readonly name: string;
  /** Provayderdagi xabar id'si */
  send(phone: string, text: string, callbackUrl?: string): Promise<string | null>;
}

/** O'zbekiston mobil raqami: +998 XX XXX XX XX */
export const isUzMobile = (phone: string) => /^\+998\d{9}$/.test(phone);

/** Shablondagi {raqam}, {manzil}, {qabul_vaqti} o'rniga qiymat qo'yadi; berilmaganlari o'chiriladi. */
export function renderTemplate(text: string, vars: Record<string, string | number | null | undefined>): string {
  return text.replace(/\{([a-z_]+)\}/g, (_, key: string) => String(vars[key] ?? '')).replace(/\s{2,}/g, ' ').trim();
}

/** SMS qismlari soni: lotin (GSM-7) 160/153, kirill yoki maxsus belgilar (UCS-2) 70/67. */
export function smsParts(text: string): number {
  const unicode = /[^\x20-\x7e\n\r]/.test(text.replace(/[ʻʼ‘’]/g, "'"));
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

/** Ishlab chiqish: SMS yuborilmaydi, server jurnaliga yoziladi (NODE_ENV=production da taqiqlangan). */
export class LogSmsDriver implements SmsDriver {
  readonly name = 'log';
  private readonly logger = new Logger('SmsLog');
  private seq = 0;

  async send(phone: string, text: string): Promise<string> {
    this.logger.log(`SMS (test) → ${phone}: ${text}`);
    return `log-${Date.now()}-${++this.seq}`;
  }
}

/**
 * Eskiz.uz (notify.eskiz.uz): token email/parol bilan olinadi va muddati tugasa yangilanadi.
 * Matnlar Eskiz moderatsiyasidan o'tgan shablonlarga mos bo'lishi kerak.
 */
export class EskizSmsDriver implements SmsDriver {
  readonly name = 'eskiz';
  private token: string | null = null;

  constructor(
    private readonly options: { email: string; password: string; from: string; baseUrl: string },
  ) {}

  private async login(): Promise<string> {
    const form = new FormData();
    form.append('email', this.options.email);
    form.append('password', this.options.password);
    const res = await fetch(`${this.options.baseUrl}/auth/login`, { method: 'POST', body: form });
    const json = (await res.json().catch(() => null)) as { data?: { token?: string }; message?: string } | null;
    if (!res.ok || !json?.data?.token) throw new SmsError(`Eskiz login: ${json?.message ?? `HTTP ${res.status}`}`, res.status === 401);
    this.token = json.data.token;
    return this.token;
  }

  async send(phone: string, text: string, callbackUrl?: string): Promise<string | null> {
    const attempt = async (token: string) => {
      const form = new FormData();
      form.append('mobile_phone', phone.replace(/^\+/, ''));
      form.append('message', text);
      form.append('from', this.options.from);
      if (callbackUrl) form.append('callback_url', callbackUrl);
      return fetch(`${this.options.baseUrl}/message/sms/send`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    };
    let res = await attempt(this.token ?? (await this.login()));
    if (res.status === 401) res = await attempt(await this.login());
    const json = (await res.json().catch(() => null)) as { id?: string | number; message?: string | Record<string, unknown> } | null;
    if (!res.ok) {
      const message = typeof json?.message === 'string' ? json.message : JSON.stringify(json?.message ?? `HTTP ${res.status}`);
      throw new SmsError(`Eskiz: ${message}`, res.status >= 400 && res.status < 500);
    }
    return json?.id !== undefined ? String(json.id) : null;
  }
}

/** Boshqa provayder yoki ichki shlyuz: POST JSON {phone, text, from, callbackUrl}, javobda {id}. */
export class HttpSmsDriver implements SmsDriver {
  readonly name = 'http';

  constructor(private readonly options: { url: string; authorization?: string; from?: string }) {}

  async send(phone: string, text: string, callbackUrl?: string): Promise<string | null> {
    const res = await fetch(this.options.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.options.authorization ? { Authorization: this.options.authorization } : {}) },
      body: JSON.stringify({ phone: phone.replace(/^\+/, ''), text, from: this.options.from, callbackUrl }),
    });
    const json = (await res.json().catch(() => null)) as { id?: string | number; message?: string } | null;
    if (!res.ok) throw new SmsError(`SMS shlyuzi: ${json?.message ?? `HTTP ${res.status}`}`, res.status >= 400 && res.status < 500);
    return json?.id !== undefined ? String(json.id) : null;
  }
}

export interface SmsInput {
  phone: string;
  text: string;
  template?: keyof SmsTemplatesSetting | string;
  citizenId?: number | null;
  ticketId?: number | null;
}

const RETRY_WINDOW_MS = 24 * 3600_000;
const FLUSH_LOCK = 7_301_098;

/** Eskiz va boshqa provayderlarning yetkazish holatlari */
const DELIVERED = new Set(['DELIVRD', 'DELIVERED', 'delivered']);
const UNDELIVERED = new Set(['UNDELIV', 'UNDELIVERABLE', 'REJECTD', 'REJECTED', 'EXPIRED', 'failed', 'FAILED']);

/**
 * Fuqaro va xodimlarga SMS (F-NOT-01, F-CRM-02, F-CRM-07): har bir xabar sms_messages jadvalida —
 * QUEUED → SENT → DELIVERED (yoki FAILED). Shlyuz ulanmagan yoki tarmoq uzilgan bo'lsa navbatda qoladi
 * va 24 soat ichida qayta yuboriladi. SMS_DRIVER: off | log | eskiz | http.
 */
@Injectable()
export class SmsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmsService.name);
  readonly driver: SmsDriver | null;
  private readonly callbackUrl?: string;
  private readonly callbackSecret?: string;
  private readonly inFlight = new Set<number>();
  private timer?: NodeJS.Timeout;
  lastError: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    config: ConfigService,
  ) {
    // Ishlab chiqishda sozlanmagan bo'lsa — test drayveri (SMS jurnalga yoziladi), ishlab chiqarishda — o'chiq
    const driver = config.get<string>('SMS_DRIVER') ?? (config.get<string>('NODE_ENV') === 'production' ? 'off' : 'log');
    const from = config.get<string>('SMS_FROM') ?? '4546';
    this.driver =
      driver === 'log'
        ? new LogSmsDriver()
        : driver === 'eskiz' && config.get('ESKIZ_EMAIL') && config.get('ESKIZ_PASSWORD')
          ? new EskizSmsDriver({
              email: config.get<string>('ESKIZ_EMAIL')!,
              password: config.get<string>('ESKIZ_PASSWORD')!,
              from,
              baseUrl: (config.get<string>('ESKIZ_BASE_URL') ?? 'https://notify.eskiz.uz/api').replace(/\/$/, ''),
            })
          : driver === 'http' && config.get('SMS_HTTP_URL')
            ? new HttpSmsDriver({ url: config.get<string>('SMS_HTTP_URL')!, authorization: config.get<string>('SMS_HTTP_AUTH') || undefined, from })
            : null;
    this.callbackSecret = config.get<string>('SMS_CALLBACK_SECRET') || undefined;
    const publicUrl = (config.get<string>('PUBLIC_API_URL') ?? '').replace(/\/$/, '');
    this.callbackUrl = publicUrl && this.callbackSecret ? `${publicUrl}/api/public/sms/callback/${this.callbackSecret}` : undefined;
  }

  onModuleInit(): void {
    this.timer = setInterval(() => void this.flush(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  status(): { state: 'connected' | 'test' | 'error' | 'off'; driver: string } {
    if (!this.driver) return { state: 'off', driver: 'off' };
    if (this.driver.name === 'log') return { state: 'test', driver: 'log' };
    return { state: this.lastError ? 'error' : 'connected', driver: this.driver.name };
  }

  /** Shablon matni (Sozlamalar → SMS shablonlari) o'zgaruvchilar bilan. */
  async template(key: keyof SmsTemplatesSetting, vars: Record<string, string | number | null | undefined>): Promise<string> {
    const templates = await this.settings.get('sms_templates');
    return renderTemplate(templates[key], vars);
  }

  /** SMS navbatga qo'yiladi va darhol yuborishga uriniladi. Mobil bo'lmagan raqamga yuborilmaydi (null). */
  async send(input: SmsInput): Promise<SmsMessage | null> {
    const phone = normalizePhone(input.phone);
    if (!isUzMobile(phone) || !input.text.trim()) return null;
    const row = await this.prisma.smsMessage.create({
      data: { phone, text: input.text.trim(), template: input.template ?? null, citizenId: input.citizenId ?? null, ticketId: input.ticketId ?? null },
    });
    return this.deliver(row);
  }

  private async deliver(row: SmsMessage): Promise<SmsMessage> {
    if (!this.driver) {
      return this.prisma.smsMessage.update({ where: { id: row.id }, data: { error: 'SMS shlyuzi ulanmagan (SMS_DRIVER) — navbatda' } });
    }
    if (this.inFlight.has(row.id)) return row;
    this.inFlight.add(row.id);
    try {
      const providerId = await this.driver.send(row.phone, row.text, this.callbackUrl);
      this.lastError = null;
      return await this.prisma.smsMessage.update({
        where: { id: row.id },
        // Test drayverida "yetkazildi" holati darhol qo'yiladi
        data: this.driver.name === 'log'
          ? { status: SmsStatus.DELIVERED, providerId, sentAt: new Date(), deliveredAt: new Date(), error: null }
          : { status: SmsStatus.SENT, providerId, sentAt: new Date(), error: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const permanent = err instanceof SmsError && err.permanent;
      if (!permanent) this.lastError = message;
      this.logger.warn(`SMS yuborilmadi (${row.id}): ${message}`);
      return this.prisma.smsMessage.update({ where: { id: row.id }, data: permanent ? { status: SmsStatus.FAILED, error: message } : { error: message } });
    } finally {
      this.inFlight.delete(row.id);
    }
  }

  /** Navbatdagi SMS'lar (shlyuz ulangach yoki tarmoq tiklangach). Bir nechta nusxada — faqat bittasi. */
  async flush(): Promise<void> {
    if (!this.driver) return;
    try {
      const rows = await this.prisma.$transaction(async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${FLUSH_LOCK}::bigint) AS locked`;
        if (!locked) return [];
        // Yangi yaratilganlari send() ichida yuborilmoqda — ularga 1 daqiqa tegilmaydi
        return tx.smsMessage.findMany({
          where: { status: SmsStatus.QUEUED, createdAt: { gt: new Date(Date.now() - RETRY_WINDOW_MS), lt: new Date(Date.now() - 60_000) } },
          orderBy: { id: 'asc' },
          take: 50,
        });
      });
      for (const row of rows) await this.deliver(row);
    } catch (err) {
      this.logger.warn(`SMS navbati yuborilmadi: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Provayderdan yetkazish holati (callback_url). */
  async handleCallback(secret: string, body: Record<string, unknown>): Promise<boolean> {
    if (!sameSecret(secret, this.callbackSecret)) return false;
    const providerId = String(body.message_id ?? body.id ?? body.request_id ?? '');
    const status = String(body.status ?? '');
    if (!providerId) return true;
    if (DELIVERED.has(status)) {
      await this.prisma.smsMessage.updateMany({ where: { providerId }, data: { status: SmsStatus.DELIVERED, deliveredAt: new Date() } });
    } else if (UNDELIVERED.has(status)) {
      await this.prisma.smsMessage.updateMany({ where: { providerId }, data: { status: SmsStatus.FAILED, error: `Yetkazilmadi: ${status}` } });
    }
    return true;
  }
}
