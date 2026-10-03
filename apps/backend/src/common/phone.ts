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
