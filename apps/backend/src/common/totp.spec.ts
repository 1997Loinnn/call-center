import { DataCipher } from './crypto';
import { base32Decode, base32Encode, hotp, otpauthUri, totpStep, verifyTotp } from './totp';

// RFC 6238 A-ilova: kalit "12345678901234567890" (ASCII), SHA-1
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('base32 ikki tomonlama', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
  });

  it('RFC 6238 test qiymatlari (oxirgi 6 raqam)', () => {
    expect(hotp(RFC_SECRET, Math.floor(59 / 30))).toBe('287082');
    expect(hotp(RFC_SECRET, Math.floor(1111111109 / 30))).toBe('081804');
    expect(hotp(RFC_SECRET, Math.floor(1234567890 / 30))).toBe('005924');
  });

  it("±1 qadam qabul qilinadi, ishlatilgan kod qayta o'tmaydi", () => {
    const at = 1_800_000_000_000;
    const step = totpStep(at);
    const code = hotp(RFC_SECRET, step - 1);
    expect(verifyTotp(RFC_SECRET, code, null, at)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, code, step - 1, at)).toBeNull();
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 3), null, at)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '12345', null, at)).toBeNull();
  });

  it('otpauth URI', () => {
    expect(otpauthUri('ABC', 'admin')).toBe('otpauth://totp/1097%20Call-markaz%3Aadmin?secret=ABC&issuer=1097%20Call-markaz&algorithm=SHA1&digits=6&period=30');
  });
});

describe('DataCipher', () => {
  const cipher = new DataCipher(undefined, 'dev-secret-0123456789abcdef0123456789');

  it("shifrlaydi va ochadi; har safar boshqa natija", () => {
    const a = cipher.encrypt('32104851230017');
    expect(cipher.isEncrypted(a)).toBe(true);
    expect(a).not.toContain('3210485');
    expect(cipher.decrypt(a)).toBe('32104851230017');
    expect(cipher.encrypt('32104851230017')).not.toBe(a);
  });

  it("buzilgan matn ochilmaydi, blind index deterministik", () => {
    const a = cipher.encrypt('x');
    const broken = a.slice(0, -2) + (a.endsWith('A') ? 'B' : 'A') + a.slice(-1);
    expect(() => cipher.decrypt(broken)).toThrow();
    expect(cipher.blindIndex('123')).toBe(cipher.blindIndex('123'));
    expect(cipher.blindIndex('123')).not.toBe(new DataCipher(Buffer.alloc(32, 7).toString('base64'), 'x').blindIndex('123'));
  });
});
