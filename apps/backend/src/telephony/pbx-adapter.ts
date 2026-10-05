import { CallDirection, CallResult } from '@prisma/client';

/** PBX'dan keladigan yakunlangan qo'ng'iroq yozuvi (CDR). */
export interface PbxCdr {
  pbxCallId: string;
  direction: CallDirection;
  callerNumber: string;
  calledNumber: string;
  extension?: string; // javob bergan operatorning ichki raqami
  queue?: string;
  startedAt: Date;
  answeredAt?: Date;
  endedAt: Date;
  result: CallResult;
  recordingFile?: string;
}

/** Navbatda kutayotgan qo'ng'iroq (jonli holat va ogohlantirishlar uchun). */
export interface QueueCaller {
  callerNumber: string;
  waitSeconds: number;
}

export interface QueueSnapshot {
  queue: string; // navbat raqami (Queue.pbxNumber)
  callers: QueueCaller[];
}

export interface TrunkStatus {
  name: string;
  up: boolean;
  /** Holat qachondan beri (ulanmagan trunk uchun) */
  since?: Date;
}

/** Navbat sozlamalari: tizimda tahrirlanadi va PBX'ga yuklanadi (F-TEL-03..05). */
export interface PbxQueueConfig {
  number: string;
  name: string;
  language: string | null;
  isActive: boolean;
  strategy: string;
  maxWaitSeconds: number;
  callbackEnabled: boolean;
  announcePosition: boolean;
  announceEverySeconds: number;
  musicOnHold: string;
  wrapUpSeconds: number;
  /** Operatorlar ichki raqami va ustuvorligi (0 — asosiy) */
  members: { extension: string; penalty: number }[];
}

export interface PbxIvrOptionConfig {
  digit: string;
  action: string;
  queue?: string;
  menu?: string;
  prompt?: string;
}

export interface PbxIvrMenuConfig {
  code: string;
  name: string;
  /** Ovozli xabar fayli (VOICE_PROMPTS_DIR dagi kalit); yozib olinmagan bo'lsa null */
  prompt: string | null;
  timeoutSeconds: number;
  maxRetries: number;
  fallbackQueue: string | null;
  options: PbxIvrOptionConfig[];
}

/** PBX'ga yuklanadigan to'liq konfiguratsiya: navbatlar, IVR va ish vaqti jadvali (F-ADM-03). */
export interface PbxConfig {
  version: number;
  /** Qora ro'yxat (F-TEL-09): bu raqamlardan qo'ng'iroq qabul qilinmaydi */
  blacklist: string[];
  queues: PbxQueueConfig[];
  ivr: { entry: string | null; menus: PbxIvrMenuConfig[] };
  schedule: {
    days: number[];
    start: string;
    end: string;
    holidays: string[];
    afterHoursPrompt: string | null;
    holidayPrompt: string | null;
    voicemail: boolean;
  };
}

export interface PbxApplyResult {
  applied: boolean;
  note: string;
}

export type PbxEvent =
  | { type: 'call.ringing'; pbxCallId: string; callerNumber: string; extension: string; queue?: string; at: Date }
  | { type: 'call.answered'; pbxCallId: string; extension: string; at: Date }
  | { type: 'call.ended'; pbxCallId: string; at: Date; cdr: PbxCdr }
  /** Fuqaro navbatda uzoq kutib, qayta qo'ng'iroqni tanladi (F-TEL-05) */
  | { type: 'callback.requested'; callerNumber: string; queue?: string; at: Date };

/**
 * Telefoniya bilan ishlash yagona interfeys orqali (TZ 10-bo'lim, "PBX adapteri"):
 * UCM6510 o'rniga Asterisk yoki boshqa ATS faqat yangi adapter yozish bilan ulanadi.
 */
export interface PbxAdapter {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(listener: (event: PbxEvent) => void): void;
  /** Operator ichki raqamidan tashqi raqamga qo'ng'iroq (click-to-call). */
  originate(extension: string, number: string): Promise<void>;
  /** Navbatlardagi kutayotgan qo'ng'iroqlar; adapter hali qo'llamasa — null. */
  queueSnapshot(): Promise<QueueSnapshot[] | null>;
  /** SIP trunklar holati; adapter hali qo'llamasa — null. */
  trunkStatus(): Promise<TrunkStatus[] | null>;
  /** Supervisor operator suhbatini o'z telefonida tinglaydi (Asterisk ChanSpy). */
  listen(supervisorExtension: string, agentExtension: string): Promise<void>;
  /** Navbatlar, IVR va ish vaqti konfiguratsiyasini PBX'ga yuklaydi ("PBX bilan sinxronlash"). */
  applyConfig(config: PbxConfig): Promise<PbxApplyResult>;
}

export const PBX_ADAPTER = Symbol('PBX_ADAPTER');

/** Mock adapter CDR'idagi yozuv belgisi: yozuvlar xizmati uning o'rniga sintetik WAV yaratadi. */
export const MOCK_RECORDING_FILE = 'mock:synthetic';
