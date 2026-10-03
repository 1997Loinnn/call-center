import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import type { ByteRange } from './range';

export const RECORDING_STORAGE = Symbol('RECORDING_STORAGE');

/**
 * Audio yozuvlar ombori. Hozir lokal papka (RECORDINGS_DIR); NAS/MinIO drayveri
 * shu interfeys bilan ulanadi (F-REC-02).
 */
export interface RecordingStorage {
  /** Fayl hajmi baytda; fayl yo'q bo'lsa null. */
  size(key: string): Promise<number | null>;
  read(key: string, range?: ByteRange): Readable;
  write(key: string, data: Buffer): Promise<void>;
}

export class LocalRecordingStorage implements RecordingStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** Kalit ombor papkasidan tashqariga chiqmasligi shart ("../" orqali boshqa faylni o'qish). */
  private path(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error(`Noto'g'ri yozuv kaliti: ${key}`);
    return full;
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.path(key))).size;
    } catch {
      return null;
    }
  }

  read(key: string, range?: ByteRange): Readable {
    return createReadStream(this.path(key), range);
  }

  async write(key: string, data: Buffer): Promise<void> {
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
  }
}
