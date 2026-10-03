import { TicketChannel, TicketStatus, TicketType } from '@prisma/client';
import { STATUS_LABELS } from './ticket-workflow';

export const TYPE_LABELS: Readonly<Record<TicketType, string>> = {
  [TicketType.INFO]: "Ma'lumot so'rash",
  [TicketType.APPLICATION]: 'Ariza yoki taklif',
  [TicketType.COMPLAINT]: 'Shikoyat',
  [TicketType.CORRUPTION]: 'Korrupsiya xabari',
  [TicketType.GRATITUDE]: 'Minnatdorchilik',
};

export const CHANNEL_LABELS: Readonly<Record<TicketChannel, string>> = {
  [TicketChannel.PHONE]: 'Telefon',
  [TicketChannel.VOICEMAIL]: 'Ovozli xabar',
  [TicketChannel.TELEGRAM]: 'Telegram',
  [TicketChannel.WEBCHAT]: 'Veb-chat',
  [TicketChannel.EMAIL]: 'Email',
};

/** Eksportdagi bir qator: ro'yxat so'rovi (LIST_SELECT) shu maydonlarni qaytaradi. */
export interface ExportRow {
  number: string;
  createdAt: Date;
  channel: TicketChannel;
  type: TicketType;
  status: TicketStatus;
  subject: string;
  dueAt: Date | null;
  category: { nameUz: string } | null;
  region: { nameUz: string } | null;
  assignedOrgUnit: { name: string } | null;
  assignee: { fullName: string } | null;
  citizen: { phone: string; fullName: string | null } | null;
}

export const EXPORT_COLUMNS = [
  'Raqam',
  'Qabul qilingan',
  'Kanal',
  'Turi',
  'Mavzu',
  'Toifa',
  'Holat',
  'Fuqaro',
  'Telefon',
  'Viloyat',
  "Mas'ul bo'linma",
  'Ijrochi',
  'Ijro muddati',
];

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Tashkent',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatExportDate = (value: Date | null): string => (value ? dateFormat.format(value).replace(',', '') : '');

/** "+998901234567" -> "+998 90 123 45 67": Excel uni son deb o'qib, "+" ni yo'qotmaydi. */
export function formatExportPhone(phone: string): string {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}

/**
 * Bitta katak: qo'shtirnoqqa olinadi; Excel formula sifatida bajarishi mumkin bo'lgan
 * qiymat (=, @, +/- dan keyin harf) oldiga apostrof qo'yiladi (CSV injection).
 */
export function csvCell(value: string): string {
  const safe = /^[=@\t\r]/.test(value) || /^[+-][^\d\s]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** BOM — Excel UTF-8 ni to'g'ri ochishi uchun; ";" — o'zbek/rus Excel'dagi ro'yxat ajratgichi. */
export function ticketsToCsv(rows: ExportRow[]): string {
  const lines = [
    EXPORT_COLUMNS,
    ...rows.map((r) => [
      r.number,
      formatExportDate(r.createdAt),
      CHANNEL_LABELS[r.channel],
      TYPE_LABELS[r.type],
      r.subject,
      r.category?.nameUz ?? '',
      STATUS_LABELS[r.status],
      r.citizen?.fullName ?? '',
      r.citizen ? formatExportPhone(r.citizen.phone) : '',
      r.region?.nameUz ?? '',
      r.assignedOrgUnit?.name ?? '',
      r.assignee?.fullName ?? '',
      formatExportDate(r.dueAt),
    ]),
  ];
  return '﻿' + lines.map((cols) => cols.map(csvCell).join(';')).join('\r\n');
}
