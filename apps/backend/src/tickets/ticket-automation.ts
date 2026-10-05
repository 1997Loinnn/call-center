import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TicketEventType, TicketStatus } from '@prisma/client';
import { NotificationsService, StaffNotice } from '../integrations/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { WorkCalendar } from './ticket-workflow';

const RUN_EVERY_MS = 5 * 60_000;
const DAY_MS = 24 * 3600_000;
/** Bir ishga tushishda ko'pi bilan shuncha murojaat (birinchi ishga tushishda eski ma'lumot ko'p bo'lishi mumkin) */
const BATCH = 300;
// Bir nechta backend nusxasi ishlasa, avtomatikani faqat bittasi bajaradi
const AUTOMATION_LOCK = 7_301_097;

const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

/** Ish kalendari: ish kunlari sozlamadan, bayramlar jadvaldan. */
export async function loadWorkCalendar(prisma: PrismaService, settings: SettingsService): Promise<WorkCalendar> {
  const [hours, holidays] = await Promise.all([settings.get('working_hours'), prisma.holiday.findMany({ select: { date: true } })]);
  return { workDays: hours.days, holidays: new Set(holidays.map((h) => dateKey(h.date))) };
}

interface DueTicket {
  id: number;
  number: string;
  subject: string;
  status: TicketStatus;
  dueAt: Date | null;
  assigneeId: number | null;
  assignedOrgUnit: { id: number; name: string; parentId: number | null } | null;
}

/**
 * Murojaatlar avtomatikasi (F-CRM-05, F-NOT-02): ijro muddati yaqinlashganda ijrochi va bo'linma rahbariga eslatma,
 * muddat o'tganda yuqori bo'linmaga eskalatsiya (ishtirokchi sifatida qo'shiladi) va supervisorlarga xabar.
 * Har bir murojaat uchun bir marta (dueSoonNotifiedAt, escalatedAt). TICKET_AUTOMATION=false — o'chiq.
 */
@Injectable()
export class TicketAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketAutomationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('TICKET_AUTOMATION') === 'false') return;
    this.timer = setInterval(() => void this.run(), RUN_EVERY_MS);
    this.timer.unref();
    setTimeout(() => void this.run(), 20_000).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<{ reminded: number; escalated: number }> {
    if (this.running) return { reminded: 0, escalated: 0 };
    this.running = true;
    try {
      const automation = await this.settings.get('automation');
      const reminderDays = await this.settings.get('ticket_sla_reminder_days');
      const select = {
        id: true,
        number: true,
        subject: true,
        status: true,
        dueAt: true,
        assigneeId: true,
        assignedOrgUnit: { select: { id: true, name: true, parentId: true } },
      } as const;

      // Murojaatlarni "band qilish" bitta tranzaksiyada: belgi qo'yilganlari boshqa nusxada qayta ishlanmaydi
      const claimed = await this.prisma.$transaction(async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${AUTOMATION_LOCK}::bigint) AS locked`;
        if (!locked) return null;
        const open = { status: { in: [TicketStatus.ROUTED, TicketStatus.IN_PROGRESS, TicketStatus.ANSWERED] } };
        const dueSoon: DueTicket[] = automation.dueSoonReminder
          ? await tx.ticket.findMany({
              where: { ...open, dueSoonNotifiedAt: null, escalatedAt: null, dueAt: { gt: now, lte: new Date(now.getTime() + reminderDays * DAY_MS) } },
              select,
              orderBy: { dueAt: 'asc' },
              take: BATCH,
            })
          : [];
        if (dueSoon.length) await tx.ticket.updateMany({ where: { id: { in: dueSoon.map((t) => t.id) } }, data: { dueSoonNotifiedAt: now } });

        const overdue: DueTicket[] = automation.overdueEscalation
          ? await tx.ticket.findMany({
              where: { status: { not: TicketStatus.CLOSED }, escalatedAt: null, dueAt: { lt: now } },
              select,
              orderBy: { dueAt: 'asc' },
              take: BATCH,
            })
          : [];
        for (const ticket of overdue) {
          const parentId = ticket.assignedOrgUnit?.parentId ?? null;
          await tx.ticket.update({ where: { id: ticket.id }, data: { escalatedAt: now } });
          await tx.ticketEvent.create({
            data: {
              ticketId: ticket.id,
              actorId: null,
              type: TicketEventType.ESCALATED,
              orgUnitId: parentId,
              comment: `Ijro muddati (${ticket.dueAt ? fmt(ticket.dueAt) : '—'}) o'tdi: yuqori bo'linma va supervisorlar xabardor qilindi`,
            },
          });
          // Yuqori bo'linma murojaatni ko'rishi uchun ishtirokchi sifatida qo'shiladi
          if (parentId) {
            await tx.ticketParticipant.upsert({
              where: { ticketId_orgUnitId: { ticketId: ticket.id, orgUnitId: parentId } },
              update: {},
              create: { ticketId: ticket.id, orgUnitId: parentId },
            });
          }
        }
        return { dueSoon, overdue };
      });
      if (!claimed) return { reminded: 0, escalated: 0 };

      const supervisors = claimed.overdue.length ? await this.notifications.supervisors() : [];
      for (const ticket of claimed.dueSoon) {
        const heads = await this.notifications.unitHeads([ticket.assignedOrgUnit?.id]);
        const days = ticket.dueAt ? Math.max(1, Math.ceil((ticket.dueAt.getTime() - now.getTime()) / DAY_MS)) : reminderDays;
        await this.notifications.notifyUsers([...(ticket.assigneeId ? [ticket.assigneeId] : []), ...heads], this.notice(ticket, 'ticket.due_soon', `Muddatga ${days} kun qoldi: ${ticket.number}`));
      }
      for (const ticket of claimed.overdue) {
        const heads = await this.notifications.unitHeads([ticket.assignedOrgUnit?.id, ticket.assignedOrgUnit?.parentId]);
        await this.notifications.notifyUsers(
          [...(ticket.assigneeId ? [ticket.assigneeId] : []), ...heads, ...supervisors],
          this.notice(ticket, 'ticket.overdue', `Muddati o'tdi: ${ticket.number}`),
        );
      }
      if (claimed.dueSoon.length || claimed.overdue.length) {
        this.logger.log(`Avtomatika: ${claimed.dueSoon.length} ta eslatma, ${claimed.overdue.length} ta eskalatsiya`);
      }
      return { reminded: claimed.dueSoon.length, escalated: claimed.overdue.length };
    } catch (err) {
      this.logger.error("Murojaatlar avtomatikasi bajarilmadi", err instanceof Error ? err.stack : String(err));
      return { reminded: 0, escalated: 0 };
    } finally {
      this.running = false;
    }
  }

  private notice(ticket: DueTicket, type: string, title: string): StaffNotice {
    const unit = ticket.assignedOrgUnit?.name ? ` · ${ticket.assignedOrgUnit.name}` : '';
    return { type, title, body: `${ticket.subject}${unit}${ticket.dueAt ? ` · muddat ${fmt(ticket.dueAt)}` : ''}`, link: `/tickets/${ticket.id}` };
  }
}
