/** Hisobot davri. Kun chegaralari server vaqt mintaqasida (Asia/Tashkent) hisoblanadi. */
export type PeriodKey = 'today' | '7d' | '30d';

export const PERIOD_KEYS: PeriodKey[] = ['today', '7d', '30d'];

export interface Period {
  from: Date;
  to: Date;
  /** Grafik ustunlari: bir kunlik davr soatlar bo'yicha, uzunrog'i kunlar bo'yicha */
  bucket: 'hour' | 'day';
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const DAYS: Record<PeriodKey, number> = { today: 1, '7d': 7, '30d': 30 };

export function periodRange(key: PeriodKey, now = new Date()): Period {
  return { from: addDays(startOfDay(now), 1 - DAYS[key]), to: now, bucket: key === 'today' ? 'hour' : 'day' };
}

/** Ixtiyoriy oraliq (from/to); berilmasa — standart davr. Kelajak sanasi hozirgi vaqt bilan cheklanadi. */
export function customRange(from: Date | undefined, to: Date | undefined, fallback: PeriodKey, now = new Date()): Period {
  if (!from && !to) return periodRange(fallback, now);
  const end = to && to < now ? to : now;
  const start = from && from < end ? from : startOfDay(end);
  return { from: start, to: end, bucket: startOfDay(start).getTime() === startOfDay(end).getTime() ? 'hour' : 'day' };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Mahalliy sana kaliti: 2026-10-03 */
export const dayKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** 03.10.2026 */
export const formatDay = (date: Date): string => `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;

/** Hisobot sarlavhasi uchun: "27.09.2026 — 03.10.2026" yoki bitta kun */
export function describePeriod(period: Period): string {
  const from = formatDay(period.from);
  const to = formatDay(period.to);
  return from === to ? from : `${from} — ${to}`;
}

/** Soniyalar → "m:ss" */
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
