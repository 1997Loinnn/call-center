import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Readable } from 'node:stream';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { callScopeWhere } from '../common/data-scope';
import { RequestMeta } from '../common/http';
import { PrismaService } from '../prisma/prisma.service';
import { MOCK_RECORDING_FILE } from '../telephony/pbx-adapter';
import type { ByteRange } from './range';
import { RECORDING_STORAGE, RecordingStorage } from './recording-storage';
import { syntheticWav } from './wav';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OpenedRecording {
  size: number;
  format: string;
  fileName: string;
  read: (range?: ByteRange) => Readable;
}

/** Qo'ng'iroq yozuvlari (F-REC-02, F-REC-05): omborga olish, tinglash va yuklab olish. */
@Injectable()
export class RecordingsService {
  private readonly logger = new Logger(RecordingsService.name);
  private readonly retentionDays: number;

  constructor(
    @Inject(RECORDING_STORAGE) private readonly storage: RecordingStorage,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.retentionDays = Number(config.get('RECORDING_RETENTION_DAYS') ?? 90);
  }

  /** CDR kelganda yozuvni omborga olib, Recording yozuvini yaratadi (saqlash muddati bilan). */
  async attach(callId: number, pbxCallId: string, recordingFile: string | undefined, talkSeconds: number): Promise<void> {
    if (!recordingFile) return;
    if (recordingFile !== MOCK_RECORDING_FILE) {
      // TODO(F-REC-02): faylni UCM6510 dan (HTTPS API) yuklab olib, shu omborga yozish
      this.logger.warn(`UCM yozuvini ko'chirish hali ulanmagan: ${recordingFile}`);
      return;
    }
    const now = new Date();
    const key = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${pbxCallId.replace(/[^\w.-]/g, '_')}.wav`;
    const data = syntheticWav(Math.max(1, talkSeconds));
    await this.storage.write(key, data);
    const recording = {
      storageKey: key,
      format: 'wav',
      sizeBytes: data.length,
      durationSeconds: Math.max(1, talkSeconds),
      retainUntil: new Date(now.getTime() + this.retentionDays * DAY_MS),
    };
    await this.prisma.recording.upsert({ where: { callId }, create: { callId, ...recording }, update: recording });
  }

  /**
   * Tinglash yoki yuklab olish uchun ochadi: foydalanuvchining ko'rish doirasi tekshiriladi.
   * audit=true bo'lsa (pleyer faylni boshidan so'raganda) audit jurnaliga yoziladi.
   */
  async open(user: AuthUser, callId: number, opts: { audit: boolean; download: boolean }, meta: RequestMeta): Promise<OpenedRecording> {
    const call = await this.prisma.call.findFirst({
      where: { AND: [{ id: callId }, callScopeWhere(user)] },
      select: { id: true, pbxCallId: true, recording: true },
    });
    const recording = call?.recording;
    if (!call || !recording || recording.deletedAt) {
      throw new NotFoundException("Yozuv topilmadi yoki saqlash muddati tugagan");
    }
    const size = await this.storage.size(recording.storageKey);
    if (size === null) throw new NotFoundException('Yozuv fayli omborda topilmadi');

    if (opts.audit) {
      await this.audit.log({
        actorId: user.id,
        action: opts.download ? 'recording.download' : 'recording.play',
        entityType: 'Call',
        entityId: callId,
        details: { pbxCallId: call.pbxCallId },
        ...meta,
      });
    }
    return {
      size,
      format: recording.format,
      fileName: `${call.pbxCallId.replace(/[^\w.-]/g, '_')}.${recording.format}`,
      read: (range) => this.storage.read(recording.storageKey, range),
    };
  }
}
