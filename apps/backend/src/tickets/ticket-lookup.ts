import { TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STATUS_LABELS } from './ticket-workflow';

/** Fuqaroga murojaat holati: IVR, Telegram bot va veb-chat (F-CRM-10). Shaxsiy ma'lumot qaytarilmaydi. */
export interface PublicTicketStatus {
  number: string;
  status: TicketStatus;
  statusLabel: string;
  createdAt: Date;
  dueAt: Date | null;
  closedAt: Date | null;
}

/** Matndagi murojaat raqami: "1097-2026-000123", "2026-000123" yoki IVR'da terilgan "2026000123". */
const NUMBER_IN_TEXT = /(?:\b\d{3,6}[-\s])?\b(20\d{2})[-\s]?(\d{6})\b/;

export function findTicketNumber(text: string): { year: string; sequence: string } | null {
  const match = NUMBER_IN_TEXT.exec(text);
  return match ? { year: match[1], sequence: match[2] } : null;
}

export async function lookupTicketStatus(prisma: PrismaService, text: string): Promise<PublicTicketStatus | null> {
  const found = findTicketNumber(text);
  if (!found) return null;
  const ticket = await prisma.ticket.findFirst({
    where: { number: { endsWith: `-${found.year}-${found.sequence}` } },
    select: { number: true, status: true, createdAt: true, dueAt: true, closedAt: true },
  });
  return ticket ? { ...ticket, statusLabel: STATUS_LABELS[ticket.status] } : null;
}

const dateUz = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

/** Fuqaroga aytiladigan yoki yuboriladigan matn. */
export function ticketStatusPhrase(status: PublicTicketStatus | null, input?: string): string {
  if (!status) {
    return input
      ? `${input.trim().slice(0, 40)} raqamli murojaat topilmadi. Raqamni tekshirib qayta yuboring yoki 1097 ga qo'ng'iroq qiling.`
      : 'Murojaat topilmadi.';
  }
  const head = `№ ${status.number} murojaatingiz holati: ${status.statusLabel.toLowerCase()}.`;
  if (status.status === TicketStatus.CLOSED) {
    return `${head}${status.closedAt ? ` Yopilgan sana: ${dateUz(status.closedAt)}.` : ''} Javob bilan 1097 orqali tanishishingiz mumkin.`;
  }
  return `${head}${status.dueAt ? ` Ijro muddati: ${dateUz(status.dueAt)}.` : ''}`;
}
