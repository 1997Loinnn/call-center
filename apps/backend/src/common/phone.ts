/**
 * Telefon raqamini E.164 ko'rinishiga keltiradi (O'zbekiston uchun).
 *   "90 123 45 67"      -> "+998901234567"
 *   "998901234567"      -> "+998901234567"
 *   "+998 (90) 123-4567" -> "+998901234567"
 * Qisqa raqamlar (masalan, 1097) va ichki raqamlar o'zgarishsiz qaytadi.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  if (digits.length > 9) return `+${digits}`;
  return digits;
}

/** Raqam qisman yashiriladi: "+998 93 ••• •• 08" (navbat, audit jurnali). */
export function maskPhone(phone: string): string {
  const m = /^\+?998(\d{2})\d{5}(\d{2})$/.exec(phone.replace(/\s/g, ''));
  return m ? `+998 ${m[1]} ••• •• ${m[2]}` : `${phone.slice(0, -2).replace(/\d/g, '•')}${phone.slice(-2)}`;
}
