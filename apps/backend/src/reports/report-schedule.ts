/**
 * Eksport shablonlari jadvali (F-REP-05): "daqiqa soat kun * hafta_kuni" ko'rinishidagi soddalashtirilgan cron
 * (ExportTemplateDto shu ko'rinishni tekshiradi) va jadval turiga qarab hisobot davri. Vaqt — server mintaqasida.
 */

export interface ReportSchedule {
  minute: number;
  hour: number;
  /** Oyning kuni (oylik jadval) yoki null */
  dayOfMonth: number | null;
  /** 0 — yakshanba … 6 — shanba (7 ham yakshanba) yoki null */
  dayOfWeek: number | null;
}

export type ScheduleKind = 'daily' | 'weekly' | 'monthly';

const WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
const pad = (n: number) => String(n).padStart(2, '0');

export function parseSchedule(expr: string | null | undefined): ReportSchedule | null {
  const m = /^(\d{1,2}) (\d{1,2}) (\*|\d{1,2}) \* (\*|[0-7])$/.exec((expr ?? '').trim());
  if (!m) return null;
  const minute = Number(m[1]);
  const hour = Number(m[2]);
  const dayOfMonth = m[3] === '*' ? null : Number(m[3]);
  const dayOfWeek = m[4] === '*' ? null : Number(m[4]) % 7;
  if (minute > 59 || hour > 23 || (dayOfMonth !== null && (dayOfMonth < 1 || dayOfMonth > 31))) return null;
  return { minute, hour, dayOfMonth, dayOfWeek };
}

export function scheduleKind(s: ReportSchedule): ScheduleKind {
  if (s.dayOfMonth !== null) return 'monthly';
  if (s.dayOfWeek !== null) return 'weekly';
  return 'daily';
}

/**
 * Jadval shu daqiqaga to'g'ri keladimi. Oyning 29–31-kunlari qisqa oylarda oxirgi kunga suriladi
 * (aks holda fevralda "31-kuni" hisobot umuman chiqmay qolardi).
 */
export function scheduleMatches(s: ReportSchedule, at: Date): boolean {
  if (at.getMinutes() !== s.minute || at.getHours() !== s.hour) return false;
  if (s.dayOfWeek !== null && at.getDay() !== s.dayOfWeek) return false;
  if (s.dayOfMonth !== null) {
    const lastDay = new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate();
    if (at.getDate() !== Math.min(s.dayOfMonth, lastDay)) return false;
  }
  return true;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOf = (dayStart: Date) => new Date(dayStart.getTime() - 1);

/**
 * Hisobot davri: kunlik jadval peshindan keyin — bugun (00:00 dan yuborish paytigacha), ertalab — kecha;
 * haftalik — oxirgi 7 to'liq kun; oylik — o'tgan kalendar oy.
 */
export function scheduledPeriod(s: ReportSchedule | null, at: Date): { from: Date; to: Date } {
  const today = startOfDay(at);
  const kind = s ? scheduleKind(s) : 'daily';
  if (kind === 'monthly') {
    return { from: new Date(at.getFullYear(), at.getMonth() - 1, 1), to: endOf(new Date(at.getFullYear(), at.getMonth(), 1)) };
  }
  if (kind === 'weekly') {
    return { from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7), to: endOf(today) };
  }
  if ((s?.hour ?? at.getHours()) >= 12) return { from: today, to: at };
  return { from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1), to: endOf(today) };
}

/** "Har kuni 18:00", "Har dushanba 08:00", "Har oyning 1-kuni 08:00" */
export function describeSchedule(s: ReportSchedule): string {
  const time = `${pad(s.hour)}:${pad(s.minute)}`;
  if (s.dayOfMonth !== null) return `Har oyning ${s.dayOfMonth}-kuni ${time}`;
  if (s.dayOfWeek !== null) return `Har ${WEEKDAYS[s.dayOfWeek]} ${time}`;
  return `Har kuni ${time}`;
}
