import { Logger } from '@nestjs/common';
import { CallDirection, CallResult } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PbxAdapter, PbxApplyResult, PbxCdr, PbxConfig, PbxEvent, QueueSnapshot, TrunkStatus } from './pbx-adapter';

export interface Ucm6510Options {
  baseUrl: string; // masalan https://192.168.0.10:8089
  user: string;
  password: string;
  pollIntervalMs?: number;
}

interface UcmResponse<T> {
  status: number; // 0 = muvaffaqiyatli
  response?: T;
}

/** UCM CDR yozuvi (maydon nomlari firmware versiyasiga qarab tekshiriladi). */
export interface UcmCdrRow {
  uniqueid: string;
  src: string;
  dst: string;
  start: string;
  answer?: string;
  end: string;
  disposition: string; // ANSWERED | NO ANSWER | BUSY | FAILED
  action_type?: string;
  dstchannel_ext?: string;
  recordfiles?: string;
}

export function mapDisposition(disposition: string): CallResult {
  switch (disposition.toUpperCase()) {
    case 'ANSWERED':
      return CallResult.ANSWERED;
    case 'BUSY':
      return CallResult.BUSY;
    case 'FAILED':
      return CallResult.FAILED;
    default:
      return CallResult.NO_ANSWER;
  }
}

export function mapUcmCdr(row: UcmCdrRow): PbxCdr {
  return {
    pbxCallId: row.uniqueid,
    direction: row.dst === '1097' ? CallDirection.INBOUND : CallDirection.OUTBOUND,
    callerNumber: row.src,
    calledNumber: row.dst,
    extension: row.dstchannel_ext || undefined,
    startedAt: new Date(row.start),
    answeredAt: row.answer ? new Date(row.answer) : undefined,
    endedAt: new Date(row.end),
    result: mapDisposition(row.disposition),
    recordingFile: row.recordfiles || undefined,
  };
}

/**
 * Grandstream UCM6510 adapteri — SKELET.
 *
 * Tasdiqlangan qism: HTTPS API'ga kirish ("challenge" -> md5(challenge + parol) -> "login" -> cookie).
 * 1-oyda UCM6510 firmware hujjati bo'yicha aniqlanadi va to'ldiriladi (TZ 7-bo'lim, 16-bo'lim savollari):
 *   - real vaqt hodisalari: AMI ulanishi (jiringlash, javob, operator holati);
 *   - CDR va yozuvlarni olish usuli (CDR API yoki /api amallari) va maydon nomlari;
 *   - click-to-call amalining nomi va parametrlari.
 * UCM o'z-o'zidan imzolangan sertifikat ishlatsa, uni NODE_EXTRA_CA_CERTS orqali ishonchli qiling;
 * TLS tekshiruvini o'chirmang.
 */
export class Ucm6510Adapter implements PbxAdapter {
  readonly name = 'ucm6510';
  private readonly logger = new Logger('Ucm6510');
  private readonly listeners: ((event: PbxEvent) => void)[] = [];
  private cookie: string | null = null;
  private pollTimer?: NodeJS.Timeout;

  constructor(private readonly options: Ucm6510Options) {}

  async start(): Promise<void> {
    await this.login();
    this.logger.log(`UCM6510 ga ulandi: ${this.options.baseUrl}`);
    const interval = this.options.pollIntervalMs ?? 60_000;
    this.pollTimer = setInterval(() => {
      this.pollCdr().catch((err) => this.logger.warn(`CDR so'rovi xatosi: ${String(err)}`));
    }, interval);
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.cookie) await this.request('logout', {}).catch(() => undefined);
    this.cookie = null;
  }

  onEvent(listener: (event: PbxEvent) => void): void {
    this.listeners.push(listener);
  }

  async originate(extension: string, number: string): Promise<void> {
    // TODO(1-oy): amal nomi va parametrlari UCM6510 API hujjati bo'yicha tasdiqlanadi
    const result = await this.request<unknown>('dialOutbound', { caller: extension, outto: number });
    if (result.status !== 0) throw new Error(`UCM originate xatosi: status ${result.status}`);
  }

  async queueSnapshot(): Promise<QueueSnapshot[] | null> {
    // TODO(1-oy): AMI "QueueStatus" (QueueEntry hodisalari) orqali; ungacha jonli navbat ko'rsatilmaydi
    return null;
  }

  async trunkStatus(): Promise<TrunkStatus[] | null> {
    // TODO(1-oy): "listVoIPTrunk" / AMI "SIPpeers" orqali trunk holati
    return null;
  }

  async listen(supervisorExtension: string, agentExtension: string): Promise<void> {
    // TODO(1-oy): UCM6510 "Spy" funksiya kodi yoki AMI Originate (ChanSpy) — tasdiqlangach qo'shiladi
    throw new Error(`UCM6510 da tinglash hali sozlanmagan (${supervisorExtension} -> ${agentExtension})`);
  }

  async applyConfig(config: PbxConfig): Promise<PbxApplyResult> {
    // TODO(2-etap): UCM6510 API ("updateQueue", "updateIVR", vaqt shartlari) amallari firmware hujjati bo'yicha
    // tasdiqlangach shu yerda yuklanadi. Ungacha konfiguratsiya tizimda saqlanadi va UCM'ga qo'lda kiritiladi.
    this.logger.warn(`UCM6510 ga avtomatik yuklash hali ulanmagan (v${config.version})`);
    return {
      applied: false,
      note: "UCM6510 API orqali avtomatik yuklash 2-etapda ulanadi: hozircha sozlamalarni UCM veb-panelida shu ro'yxat bo'yicha kiriting",
    };
  }

  private async login(): Promise<void> {
    const challenge = await this.request<{ challenge: string }>('challenge', { user: this.options.user, version: '1.0' });
    if (challenge.status !== 0 || !challenge.response) {
      throw new Error(`UCM challenge xatosi: status ${challenge.status}`);
    }
    const token = createHash('md5').update(challenge.response.challenge + this.options.password).digest('hex');
    const login = await this.request<{ cookie: string }>('login', { user: this.options.user, token });
    if (login.status !== 0 || !login.response) {
      throw new Error(`UCM login xatosi: status ${login.status}`);
    }
    this.cookie = login.response.cookie;
  }

  private async pollCdr(): Promise<void> {
    // TODO(1-oy): CDR olish usuli tanlanadi; natija mapUcmCdr() orqali "call.ended" hodisasiga aylanadi:
    //   for (const row of rows) this.emit({ type: 'call.ended', pbxCallId: row.uniqueid, at: new Date(row.end), cdr: mapUcmCdr(row) });
    if (!this.cookie) await this.login();
  }

  private async request<T>(action: string, params: Record<string, string>): Promise<UcmResponse<T>> {
    const body = { request: { action, ...(this.cookie ? { cookie: this.cookie } : {}), ...params } };
    const res = await fetch(`${this.options.baseUrl}/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`UCM API HTTP ${res.status}`);
    return (await res.json()) as UcmResponse<T>;
  }

  protected emit(event: PbxEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
