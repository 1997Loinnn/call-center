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

export const isOverdue = (dueAt: string | null, status: TicketStatus): boolean =>
  !!dueAt && status !== 'CLOSED' && dayjs(dueAt).isBefore(dayjs());

export const formatNumber = (value: number): string => new Intl.NumberFormat('uz-UZ').format(value);
