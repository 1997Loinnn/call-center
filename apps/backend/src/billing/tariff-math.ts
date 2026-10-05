/**
 * Chiquvchi qo'ng'iroqni tariflash (F-BIL-01/03): sof funksiyalar, bazasiz sinovdan o'tkaziladi.
 *
 * Tarif — raqam prefiksi + daqiqa narxi + tariflash qadami. Bir nechta prefiks mos kelsa eng uzuni olinadi
 * ("99890" mobil, "998" shaharlararo); amal qilish muddati qo'ng'iroq boshlangan vaqtga qarab tekshiriladi.
 */

export interface TariffLike {
  id: number;
  prefix: string;
  pricePerMinute: number;
  billingStepSec: number;
  validFrom: Date;
  validTo: Date | null;
}

export interface Charge {
  tariffId: number;
  billableSec: number;
  amount: number;
}

/**
 * Terilgan raqamning faqat raqamlari, xalqaro ko'rinishda: "+998 90 123-45-67" → "998901234567",
 * "0074951234567" → "74951234567", O'zbekiston ichidagi 9 xonali raqam → "998…".
 */
export function dialedDigits(number: string): string {
  let digits = number.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('810')) digits = digits.slice(3);
  if (digits.length === 9) digits = `998${digits}`;
  return digits;
}

/** Ichki raqamlar (operator↔operator) va qisqa xizmat raqamlari tariflanmaydi. */
export function isExternalNumber(number: string): boolean {
  return dialedDigits(number).length >= 10;
}

/** `at` paytida amal qiladigan, raqamga eng uzun prefiks bilan mos keladigan tarif. */
export function matchTariff<T extends TariffLike>(tariffs: T[], number: string, at: Date): T | null {
  const digits = dialedDigits(number);
  let best: T | null = null;
  for (const t of tariffs) {
    if (!digits.startsWith(t.prefix)) continue;
    if (t.validFrom.getTime() > at.getTime()) continue;
    if (t.validTo && t.validTo.getTime() <= at.getTime()) continue;
    // Prefiks teng bo'lsa — keyinroq kuchga kirgani (yangi narx)
    if (!best || t.prefix.length > best.prefix.length || (t.prefix.length === best.prefix.length && t.validFrom > best.validFrom)) {
      best = t;
    }
  }
  return best;
}

/** Suhbat soniyalari tariflash qadamiga yuqoriga yaxlitlanadi; summa tiyingacha. */
export function chargeFor(tariff: TariffLike, talkSeconds: number): Charge {
  const step = Math.max(1, tariff.billingStepSec);
  const billableSec = talkSeconds > 0 ? Math.ceil(talkSeconds / step) * step : 0;
  const amount = Math.round(((billableSec / 60) * tariff.pricePerMinute) * 100) / 100;
  return { tariffId: tariff.id, billableSec, amount };
}

/** Oy kaliti "YYYY-MM" va uning [boshi, oxiri) chegaralari (server vaqt mintaqasida). */
export function monthRange(month: string): { from: Date; to: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error(`Noto'g'ri oy: ${month}`);
  const year = Number(m[1]);
  const index = Number(m[2]) - 1;
  return { from: new Date(year, index, 1), to: new Date(year, index + 1, 1) };
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Limit holati: 0 — me'yorda, 1 — ogohlantirish chegarasidan o'tdi, 2 — limit tugadi.
 * Limit 0 bo'lsa (chiquvchi qo'ng'iroq taqiqlangan) birinchi so'mdayoq 2.
 */
export function limitLevel(spent: number, limit: number, warnPercent: number): 0 | 1 | 2 {
  if (spent >= limit && (limit > 0 || spent > 0)) return 2;
  if (limit > 0 && spent >= (limit * warnPercent) / 100) return 1;
  return 0;
}
