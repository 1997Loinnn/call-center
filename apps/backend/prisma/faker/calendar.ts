import { Random } from './random';

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Kun boshi (server vaqt mintaqasida, Asia/Tashkent) */
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

/** Kunning berilgan soati (kasr soat ham bo'ladi: 9.5 = 09:30) */
export function atHour(day: Date, hour: number): Date {
  return new Date(startOfDay(day).getTime() + hour * HOUR);
}

export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const later = (date: Date, ms: number): Date => new Date(date.getTime() + ms);

/**
 * Ish vaqti kalendari: settings.working_hours va holidays jadvali asosida.
 * Xodimlarning harakatlari (yo'naltirish, javob, tasdiqlash) faqat ish vaqtida bo'ladi.
 */
export class WorkCalendar {
  constructor(
    private readonly workDays: number[],
    readonly startHour: number,
    readonly endHour: number,
    private readonly holidays: Set<string>,
  ) {}

  isWorkday(day: Date): boolean {
    return this.workDays.includes(day.getDay()) && !this.holidays.has(dateKey(day));
  }

  isWorkingTime(t: Date): boolean {
    const hour = t.getHours() + t.getMinutes() / 60;
    return this.isWorkday(t) && hour >= this.startHour && hour < this.endHour;
  }

  /** Vaqt ish vaqtidan tashqarida bo'lsa, keyingi ish kunining boshiga (biroz kechikish bilan) suriladi. */
  snap(t: Date, rnd: Random): Date {
    if (this.isWorkingTime(t)) return t;
    let day = startOfDay(t);
    const hour = t.getHours() + t.getMinutes() / 60;
    if (!this.isWorkday(day) || hour >= this.endHour) day = addDays(day, 1);
    while (!this.isWorkday(day)) day = addDays(day, 1);
    return later(atHour(day, this.startHour), rnd.int(5, 75) * MINUTE);
  }

  /** Ish soatlari bo'yicha vaqt qo'shadi: 18:00 dan keyin qolgan qismi ertangi ish kuniga o'tadi. */
  addWorkingHours(from: Date, hours: number, rnd: Random): Date {
    let t = this.snap(from, rnd);
    let remaining = hours * HOUR;
    for (;;) {
      const dayEnd = atHour(t, this.endHour).getTime();
      const available = dayEnd - t.getTime();
      if (remaining <= available) return new Date(t.getTime() + remaining);
      remaining -= Math.max(0, available);
      let next = addDays(startOfDay(t), 1);
      while (!this.isWorkday(next)) next = addDays(next, 1);
      t = atHour(next, this.startHour);
    }
  }
}
