import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * Maxfiy ma'lumotlarni bazada shifrlab saqlash (TZ 9-bo'lim): 2FA kaliti, JShShIR.
 * AES-256-GCM; kalit DATA_ENCRYPTION_KEY dan (base64 yoki hex, 32 bayt). Kalit berilmasa (ishlab chiqish)
 * JWT_SECRET dan hosil qilinadi — ishlab chiqarishda alohida kalit bering, aks holda JWT_SECRET almashsa ma'lumot ochilmaydi.
 */
export class DataCipher {
  private readonly key: Buffer;
  private readonly indexKey: Buffer;

  constructor(keyMaterial: string | undefined, fallbackSecret: string) {
    this.key = DataCipher.parseKey(keyMaterial) ?? createHash('sha256').update(`data-key:${fallbackSecret}`).digest();
    // Qidiruv indeksi uchun alohida kalit: shifrlangan qiymat bo'yicha "teng" qidiruv (blind index)
    this.indexKey = createHash('sha256').update(Buffer.concat([this.key, Buffer.from('blind-index')])).digest();
  }

  static parseKey(material: string | undefined): Buffer | null {
    if (!material) return null;
    const buf = /^[0-9a-f]{64}$/i.test(material) ? Buffer.from(material, 'hex') : Buffer.from(material, 'base64');
    if (buf.length !== 32) throw new Error("DATA_ENCRYPTION_KEY 32 bayt bo'lishi kerak (masalan: openssl rand -base64 32)");
    return buf;
  }

  /** "v1.<iv>.<tag>.<matn>" (base64url) */
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
  }

  decrypt(value: string): string {
    const [version, iv, tag, data] = value.split('.');
    if (version !== 'v1' || !iv || !tag || data === undefined) throw new Error("Shifrlangan qiymat formati noto'g'ri");
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }

  isEncrypted(value: string | null | undefined): boolean {
    return !!value && value.startsWith('v1.') && value.split('.').length === 4;
  }

  /** Teng qiymat bo'yicha qidirish uchun deterministik xesh (qiymatning o'zi saqlanmaydi). */
  blindIndex(value: string): string {
    return createHmac('sha256', this.indexKey).update(value).digest('hex');
  }
}
