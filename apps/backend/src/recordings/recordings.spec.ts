import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataScope } from '@prisma/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { parseRange } from './range';
import { LocalRecordingStorage } from './recording-storage';
import { RecordingsService } from './recordings.service';
import { syntheticWav } from './wav';

describe('parseRange', () => {
  it("sarlavha bo'lmasa butun fayl", () => {
    expect(parseRange(undefined, 100)).toBeNull();
  });

  it('boshlanish va oxirni oladi, oxirni fayl hajmiga qisqartiradi', () => {
    expect(parseRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
  });

  it('oxirgi N baytni qaytaradi', () => {
    expect(parseRange('bytes=-30', 100)).toEqual({ start: 70, end: 99 });
  });

  it("noto'g'ri yoki fayldan tashqaridagi oraliq — 416", () => {
    expect(parseRange('bytes=100-', 100)).toBe('invalid');
    expect(parseRange('bytes=50-10', 100)).toBe('invalid');
    expect(parseRange('bytes=0-1,5-6', 100)).toBe('invalid');
    expect(parseRange('items=0-1', 100)).toBe('invalid');
  });
});

describe('syntheticWav', () => {
  it("to'g'ri WAV sarlavhasi va hajm", () => {
    const wav = syntheticWav(2);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(8000);
    expect(wav.readUInt32LE(40)).toBe(2 * 8000 * 2);
    expect(wav.length).toBe(44 + 2 * 8000 * 2);
  });
});

describe('LocalRecordingStorage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'recordings-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('yozadi, hajmini va oraliqni o\'qiydi', async () => {
    const storage = new LocalRecordingStorage(dir);
    await storage.write('2026/10/a.wav', Buffer.from('0123456789'));
    expect(await storage.size('2026/10/a.wav')).toBe(10);
    const chunks: Buffer[] = [];
    for await (const chunk of storage.read('2026/10/a.wav', { start: 2, end: 4 })) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('234');
  });

  it("yo'q fayl uchun null", async () => {
    expect(await new LocalRecordingStorage(dir).size('none.wav')).toBeNull();
  });

  it('ombordan tashqaridagi yo\'lni rad etadi', async () => {
    const storage = new LocalRecordingStorage(dir);
    await expect(storage.write('../escape.wav', Buffer.from('x'))).rejects.toThrow("Noto'g'ri yozuv kaliti");
    expect(() => storage.read('../../etc/passwd')).toThrow("Noto'g'ri yozuv kaliti");
  });
});

describe('RecordingsService.open', () => {
  let dir: string;
  const user = { id: 1, scope: DataScope.ALL, permissions: [] } as unknown as AuthUser;

  const serviceFor = (storageKey: string) => {
    const recording = { storageKey, format: 'wav', durationSeconds: 2, deletedAt: null };
    const prisma = { call: { findFirst: jest.fn().mockResolvedValue({ id: 7, pbxCallId: 'demo-1.1', recording }) } };
    const audit = { log: jest.fn() };
    const config = { get: () => undefined };
    return new RecordingsService(
      new LocalRecordingStorage(dir),
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      config as unknown as ConfigService,
    );
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'recordings-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('demo yozuv fayli birinchi tinglashda yaratiladi', async () => {
    const opened = await serviceFor('demo/2026/10/demo-1.1.wav').open(user, 7, { audit: false, download: false }, {});
    expect(opened.size).toBe(44 + 2 * 8000 * 2);
    expect(await new LocalRecordingStorage(dir).size('demo/2026/10/demo-1.1.wav')).toBe(opened.size);
  });

  it("oddiy yozuv fayli yo'q bo'lsa — 404", async () => {
    await expect(serviceFor('2026/10/real.wav').open(user, 7, { audit: false, download: false }, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
