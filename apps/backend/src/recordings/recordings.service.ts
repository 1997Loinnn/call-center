import { Inject, Injectable, Optional, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Readable } from 'node:stream';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { callScopeWhere } from '../common/data-scope';
import { RequestMeta } from '../common/http';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { MOCK_RECORDING_FILE } from '../telephony/pbx-adapter';
import type { ByteRange } from './range';
import { RECORDING_STORAGE, RecordingStorage } from './recording-storage';
import { syntheticWav } from './wav';

const DAY_MS = 24 * 60 * 60 * 1000;
const PURGE_EVERY_MS = 60 * 60 * 1000;
const PURGE_BATCH = 1000;
// Bir nechta backend nusxasi ishlasa, o'chirishni faqat bittasi bajaradi
const PURGE_LOCK = 7_301_099;

/** Demo ma'lumotlar (prisma/faker) yozuvlari: fayl oldindan yaratilmaydi, birinchi tinglashda sintez qilinadi. */
export const DEMO_RECORDING_PREFIX = 'demo/';

export interface OpenedRecording {
  size: number;
  format: string;
  fileName: string;
  read: (range?: ByteRange) => Readable;
}

/**
 * Qo'ng'iroq yozuvlari (F-REC-02, F-REC-03, F-REC-05): omborga olish, tinglash va yuklab olish; saqlash muddati
 * tugaganlari har soatda o'chiriladi (nizoli — "saqlab qo'yilgan" yozuvlardan tashqari). RECORDINGS_PURGE=false — o'chiq.
 */
@Injectable()
export class RecordingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecordingsService.name);
  private readonly retentionDays: number;
  private readonly purgeEnabled: boolean;
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(RECORDING_STORAGE) private readonly storage: RecordingStorage,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService,
    @Optional() private readonly settings?: SettingsService,
  ) {
    this.retentionDays = Number(config.get('RECORDING_RETENTION_DAYS') ?? 90);
    this.purgeEnabled = config.get<string>('RECORDINGS_PURGE') !== 'false';
  }

  onModuleInit(): void {
    if (!this.purgeEnabled) return;
    this.timer = setInterval(() => void this.purgeExpired(), PURGE_EVERY_MS);
    this.timer.unref();
    setTimeout(() => void this.purgeExpired(), 60_000).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Saqlash muddati tugagan yozuvlar: fayl o'chiriladi, yozuvda deletedAt qoladi (CDR va audit saqlanadi). */
  async purgeExpired(now = new Date()): Promise<number> {
    try {
      const expired = await this.prisma.$transaction(async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${PURGE_LOCK}::bigint) AS locked`;
        if (!locked) return [];
        const rows = await tx.recording.findMany({
          where: { retainUntil: { lt: now }, deletedAt: null, legalHold: false },
          select: { id: true, storageKey: true },
          orderBy: { retainUntil: 'asc' },
          take: PURGE_BATCH,
        });
        if (rows.length) await tx.recording.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { deletedAt: now } });
        return rows;
      });
      for (const row of expired) {
        await this.storage.remove(row.storageKey).catch((err: unknown) => this.logger.warn(`Yozuv fayli o'chirilmadi: ${row.storageKey} (${String(err)})`));
      }
      if (expired.length) {
        await this.audit.log({ action: 'recording.purge', entityType: 'Recording', details: { count: expired.length, before: now.toISOString().slice(0, 10) } });
        this.logger.log(`Saqlash muddati tugagan ${expired.length} ta yozuv o'chirildi`);
      }
      return expired.length;
    } catch (err) {
      this.logger.error("Muddati tugagan yozuvlarni o'chirib bo'lmadi", err instanceof Error ? err.stack : String(err));
      return 0;
    }
  }

  /** Nizoli yozuv (F-REC-03): "saqlab qo'yish" belgisi bilan avtomatik o'chirilmaydi. */
  async setHold(user: AuthUser, callId: number, hold: boolean, reason: string | undefined, meta: RequestMeta) {
    const call = await this.prisma.call.findFirst({
      where: { AND: [{ id: callId }, callScopeWhere(user)] },
      select: { id: true, pbxCallId: true, recording: { select: { id: true, deletedAt: true, legalHold: true } } },
    });
    if (!call?.recording) throw new NotFoundException('Yozuv topilmadi');
    if (call.recording.deletedAt) throw new NotFoundException("Yozuv saqlash muddati tugagani uchun o'chirilgan");
    const recording = await this.prisma.recording.update({
      where: { id: call.recording.id },
      data: { legalHold: hold },
      select: { id: true, legalHold: true, retainUntil: true, deletedAt: true, durationSeconds: true },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'recording.hold',
      entityType: 'Call',
      entityId: callId,
      details: { pbxCallId: call.pbxCallId, changes: { legalHold: { from: call.recording.legalHold, to: hold } }, ...(reason ? { comment: reason } : {}) },
      ...meta,
    });
    return recording;
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
    // Saqlash muddati: Tizim → Sozlamalar (administrator o'zgartiradi), bo'lmasa RECORDING_RETENTION_DAYS
    const retentionDays = (await this.settings?.get('recording_retention_days')) ?? this.retentionDays;
    const key = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${pbxCallId.replace(/[^\w.-]/g, '_')}.wav`;
    const data = syntheticWav(Math.max(1, talkSeconds));
    await this.storage.write(key, data);
    const recording = {
      storageKey: key,
      format: 'wav',
      sizeBytes: data.length,
      durationSeconds: Math.max(1, talkSeconds),
      retainUntil: new Date(now.getTime() + retentionDays * DAY_MS),
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
    let size = await this.storage.size(recording.storageKey);
    if (size === null && recording.storageKey.startsWith(DEMO_RECORDING_PREFIX)) {
      await this.storage.write(recording.storageKey, syntheticWav(recording.durationSeconds));
      size = await this.storage.size(recording.storageKey);
    }
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
