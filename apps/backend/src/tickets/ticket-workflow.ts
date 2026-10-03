import { TicketStatus, TicketType } from '@prisma/client';

/**
 * Murojaat holatlari va ruxsat etilgan o'tishlar (TZ 6.3, F-CRM-04 diagrammasi).
 *
 *   NEW ──► ROUTED ──► IN_PROGRESS ──► ANSWERED ──► CLOSED
 *    │        │  ▲          ▲              │           │
 *    │        ▼  │          └── rad etish ─┘           │
 *    │      RETURNED        └──── qayta ochish ────────┘
 *    └──► CLOSED (faqat ma'lumot berildi / minnatdorchilik)
 */
export const TICKET_TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  [TicketStatus.NEW]: [TicketStatus.ROUTED, TicketStatus.CLOSED],
  [TicketStatus.ROUTED]: [TicketStatus.IN_PROGRESS, TicketStatus.RETURNED],
  [TicketStatus.RETURNED]: [TicketStatus.ROUTED],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.ANSWERED],
  [TicketStatus.ANSWERED]: [TicketStatus.IN_PROGRESS, TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [TicketStatus.IN_PROGRESS],
};

export const STATUS_LABELS: Readonly<Record<TicketStatus, string>> = {
  [TicketStatus.NEW]: 'Yangi',
  [TicketStatus.ROUTED]: "Yo'naltirildi",
  [TicketStatus.IN_PROGRESS]: 'Ijroda',
  [TicketStatus.ANSWERED]: 'Javob tayyorlandi',
  [TicketStatus.CLOSED]: 'Yopildi',
  [TicketStatus.RETURNED]: 'Qaytarildi',
};

/** Qonundagi asosiy muddat: 15 kun (qo'shimcha o'rganish talab etilsa 1 oygacha uzaytiriladi). */
export const DEFAULT_SLA_DAYS = 15;

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from].includes(to);
}

/** Ijroni talab qilmaydigan murojaatlar qabul qilingan zahoti yopilishi mumkin. */
export function canCloseImmediately(type: TicketType): boolean {
  return type === TicketType.INFO || type === TicketType.GRATITUDE;
}

/** Ijro muddati kalendar kunlarida hisoblanadi; bayram kunlarini hisobga olish keyingi bosqichda. */
export function computeDueAt(from: Date, slaDays: number): Date {
  const due = new Date(from);
  due.setDate(due.getDate() + slaDays);
  return due;
}

export function formatTicketNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(6, '0')}`;
}
