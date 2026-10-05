import { Logger } from '@nestjs/common';
import { CallDirection, CallResult } from '@prisma/client';
import { EventEmitter } from 'node:events';
import { MockQueueSimulator } from './mock-queue';
import { MOCK_RECORDING_FILE, PbxAdapter, PbxApplyResult, PbxConfig, PbxEvent, QueueSnapshot, TrunkStatus } from './pbx-adapter';

const RING_SECONDS = 3;

/**
 * UCM6510siz ishlab chiqish va sinov uchun PBX taqlidi (PBX_DRIVER=mock).
 * Operator panelida "Test qo'ng'iroq" tugmasi shu adapter orqali ishlaydi.
 */
export class MockPbxAdapter implements PbxAdapter {
  readonly name = 'mock';
  private readonly logger = new Logger('MockPbx');
  private readonly emitter = new EventEmitter();
  /** MOCK_QUEUE_SIMULATION=false bo'lsa navbat doim bo'sh */
  private readonly queue: MockQueueSimulator | null;

  constructor(options: { simulateQueue?: boolean } = {}) {
    // Qayta qo'ng'iroq: yuklangan konfiguratsiyadagi navbat chegarasi, yuklanmagan bo'lsa — 120 s
    this.queue =
      options.simulateQueue === false
        ? null
        : new MockQueueSimulator(Math.random, Date.now(), {
            after: (queue) => {
              const config = this.lastConfig?.queues.find((q) => q.number === queue);
              if (!config) return 120;
              return config.callbackEnabled ? config.maxWaitSeconds : null;
            },
            onRequest: (queue, callerNumber) => this.emit({ type: 'callback.requested', callerNumber, queue, at: new Date() }),
          });
  }

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
    this.simulateOutgoingCall(extension, number);
  }

  /**
   * Chiquvchi qo'ng'iroq taqlidi: ~75% hollarda javob, 8–20 s suhbat, so'ng CDR. Shu orqali kampaniya va qayta
   * qo'ng'iroq natijalari, tariflash (F-BIL-03) va xarajat limitlari UCM6510siz sinaladi.
   */
  private simulateOutgoingCall(extension: string, number: string, random: () => number = Math.random): void {
    const pbxCallId = `mock-out-${Date.now()}`;
    const startedAt = new Date();
    const answered = random() < 0.75;
    const talkSeconds = answered ? 8 + Math.floor(random() * 13) : 0;
    setTimeout(() => {
      this.emit({
        type: 'call.ended',
        pbxCallId,
        at: new Date(),
        cdr: {
          pbxCallId,
          direction: CallDirection.OUTBOUND,
          callerNumber: extension,
          calledNumber: number,
          extension,
          startedAt,
          answeredAt: answered ? new Date(startedAt.getTime() + RING_SECONDS * 1000) : undefined,
          endedAt: new Date(),
          result: answered ? CallResult.ANSWERED : CallResult.NO_ANSWER,
          recordingFile: answered ? MOCK_RECORDING_FILE : undefined,
        },
      });
    }, (RING_SECONDS + talkSeconds) * 1000).unref();
  }

  async queueSnapshot(): Promise<QueueSnapshot[]> {
    return this.queue?.snapshot() ?? [];
  }

  async trunkStatus(): Promise<TrunkStatus[]> {
    return [{ name: '1097-trunk', up: true }];
  }

  async listen(supervisorExtension: string, agentExtension: string): Promise<void> {
    this.logger.log(`listen: ${supervisorExtension} -> ${agentExtension}`);
  }

  /** Oxirgi yuklangan konfiguratsiya (testlar va jurnal uchun). */
  lastConfig: PbxConfig | null = null;

  async applyConfig(config: PbxConfig): Promise<PbxApplyResult> {
    this.lastConfig = config;
    const menus = config.ivr.menus.length;
    this.logger.log(`applyConfig v${config.version}: ${config.queues.length} navbat, ${menus} IVR menyu`);
    return { applied: true, note: `Test rejimi: konfiguratsiya mock PBX'ga yuklandi (${config.queues.length} navbat, ${menus} menyu)` };
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
