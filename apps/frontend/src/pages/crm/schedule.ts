// Eksport shablonining yuborish jadvali: oddiy cron ("daqiqa soat kun * hafta_kuni") ↔ forma maydonlari

export type Frequency = 'manual' | 'daily' | 'weekly' | 'monthly';

export interface Schedule {
  frequency: Frequency;
  time: string; // HH:mm
  weekday: number; // 1 = dushanba … 7 = yakshanba
  monthDay: number;
}

export const WEEKDAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];

const DEFAULT: Schedule = { frequency: 'manual', time: '09:00', weekday: 1, monthDay: 1 };

const pad = (n: number) => String(n).padStart(2, '0');

export function parseSchedule(cron: string | null): Schedule {
  const parts = cron?.trim().split(/\s+/) ?? [];
  if (parts.length !== 5) return DEFAULT;
  const [minute, hour, day, , weekday] = parts;
  const time = `${pad(Number(hour) || 0)}:${pad(Number(minute) || 0)}`;
  if (day !== '*') return { ...DEFAULT, frequency: 'monthly', time, monthDay: Number(day) || 1 };
  if (weekday !== '*') return { ...DEFAULT, frequency: 'weekly', time, weekday: Number(weekday) === 0 ? 7 : Number(weekday) || 1 };
  return { ...DEFAULT, frequency: 'daily', time };
}

export function buildSchedule(s: Schedule): string | null {
  if (s.frequency === 'manual') return null;
  const [hour, minute] = s.time.split(':').map(Number);
  const head = `${minute || 0} ${hour || 0}`;
  if (s.frequency === 'monthly') return `${head} ${s.monthDay} * *`;
  if (s.frequency === 'weekly') return `${head} * * ${s.weekday}`;
  return `${head} * * *`;
}

export function describeSchedule(cron: string | null): string {
  const s = parseSchedule(cron);
  switch (s.frequency) {
    case 'daily':
      return `Har kuni ${s.time}`;
    case 'weekly':
      return `Har ${WEEKDAYS[s.weekday - 1]?.toLowerCase()} ${s.time}`;
    case 'monthly':
      return `Har oyning ${s.monthDay}-kuni ${s.time}`;
    default:
      return "Qo'lda";
  }
}
