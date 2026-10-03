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

export type PbxEvent =
  | { type: 'call.ringing'; pbxCallId: string; callerNumber: string; extension: string; queue?: string; at: Date }
  | { type: 'call.answered'; pbxCallId: string; extension: string; at: Date }
  | { type: 'call.ended'; pbxCallId: string; at: Date; cdr: PbxCdr };

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
}

export const PBX_ADAPTER = Symbol('PBX_ADAPTER');
