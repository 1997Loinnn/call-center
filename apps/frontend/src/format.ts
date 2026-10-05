import dayjs from 'dayjs';
import type { TicketStatus } from './api/types';

export const formatDateTime = (value: string | null | undefined): string =>
  value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—';

export const formatDate = (value: string | null | undefined): string => (value ? dayjs(value).format('DD.MM.YYYY') : '—');

/** Soniyalarni "m:ss" ko'rinishiga keltiradi: 75 -> "1:15". */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** +998901234567 → "+998 90 123 45 67"; boshqa ko'rinishdagi raqam o'zgarishsiz qaytadi. */
export function formatPhone(value: string): string {
  const m = /^\+?998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(value.replace(/[\s()-]/g, ''));
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : value;
}

export const isOverdue =(dueAt: string | null, status: TicketStatus): boolean =>
  !!dueAt && status !== 'CLOSED' && dayjs(dueAt).isBefore(dayjs());

export const formatNumber = (value: number): string => new Intl.NumberFormat('uz-UZ').format(value);

/** Holat davomiyligi: soatdan kam bo'lsa "07:48", aks holda "1:12:40". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
