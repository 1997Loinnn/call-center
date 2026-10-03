import { Logger } from '@nestjs/common';
import { CallDirection, CallResult } from '@prisma/client';
import { EventEmitter } from 'node:events';
import { MOCK_RECORDING_FILE, PbxAdapter, PbxEvent } from './pbx-adapter';

const RING_SECONDS = 3;

/**
 * UCM6510siz ishlab chiqish va sinov uchun PBX taqlidi (PBX_DRIVER=mock).
 * Operator panelida "Test qo'ng'iroq" tugmasi shu adapter orqali ishlaydi.
 */
export class MockPbxAdapter implements PbxAdapter {
  readonly name = 'mock';
  private readonly logger = new Logger('MockPbx');
  private readonly emitter = new EventEmitter();

  async start(): Promise<void> {
    this.logger.log('Mock PBX ishga tushdi (UCM6510siz ishlab chiqish rejimi)');
  }

  async stop(): Promise<void> {
    this.emitter.removeAllListeners();
  }

  onEvent(listener: (event: PbxEvent) => void): void {
    this.emitter.on('event', listener);
  }

  async originate(extension: string, number: string): Promise<void> {
    this.logger.log(`originate: ${extension} -> ${number}`);
  }

  /** Kiruvchi qo'ng'iroqni taqlid qiladi: jiringlash, javob, suhbat va yakun. */
  simulateIncomingCall(extension: string, callerNumber: string, talkSeconds = 20): string {
    const pbxCallId = `mock-${Date.now()}`;
    const startedAt = new Date();
    const answeredAt = new Date(startedAt.getTime() + RING_SECONDS * 1000);

    this.emit({ type: 'call.ringing', pbxCallId, callerNumber, extension, queue: '6500', at: startedAt });
    setTimeout(() => this.emit({ type: 'call.answered', pbxCallId, extension, at: new Date() }), RING_SECONDS * 1000).unref();
    setTimeout(() => {
      const endedAt = new Date();
      this.emit({
        type: 'call.ended',
        pbxCallId,
        at: endedAt,
        cdr: {
          pbxCallId,
          direction: CallDirection.INBOUND,
          callerNumber,
          calledNumber: '1097',
          extension,
          queue: '6500',
          startedAt,
          answeredAt,
          endedAt,
          result: CallResult.ANSWERED,
          recordingFile: MOCK_RECORDING_FILE,
        },
      });
    }, (RING_SECONDS + talkSeconds) * 1000).unref();

    return pbxCallId;
  }

  private emit(event: PbxEvent): void {
    this.emitter.emit('event', event);
  }
}
