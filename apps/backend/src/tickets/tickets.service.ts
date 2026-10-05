import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TicketChannel, TicketEventType, TicketStatus, TicketType } from '@prisma/client';
import { AiService } from '../ai/ai.module';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../integrations/notifications.service';
import { SmsService } from '../integrations/sms';
import { AuthUser } from '../common/auth-user';
import { hasPermission, managesOrgUnit, ticketScopeWhere } from '../common/data-scope';
import { Page, pageArgs, RequestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';
import { pickBestRule, RoutingContext } from './routing';
import { loadWorkCalendar } from './ticket-automation';
import { ticketsToCsv } from './ticket-export';
import {
  canCloseImmediately,
  canTransition,
  computeDueAt,
  DEFAULT_SLA_DAYS,
  formatTicketNumber,
  STATUS_LABELS,
} from './ticket-workflow';
import { AnswerTicketDto, AssignTicketDto, CreateTicketDto, RouteTicketDto, TicketsQueryDto } from './tickets.dto';

const LIST_SELECT = {
  id: true,
  number: true,
  channel: true,
  type: true,
  status: true,
  subject: true,
  isAnonymous: true,
  isConfidential: true,
  aiFlags: true,
  createdAt: true,
  dueAt: true,
  closedAt: true,
  category: { select: { id: true, nameUz: true } },
  region: { select: { id: true, nameUz: true } },
  assignedOrgUnit: { select: { id: true, name: true } },
  assignee: { select: { id: true, fullName: true } },
  citizen: { select: { id: true, phone: true, fullName: true } },
} satisfies Prisma.TicketSelect;

const DETAIL_INCLUDE = {
  category: { select: { id: true, nameUz: true, slaDays: true, sortOrder: true, parent: { select: { id: true, nameUz: true } } } },
  region: { select: { id: true, nameUz: true } },
  district: { select: { id: true, nameUz: true } },
  citizen: { select: { id: true, phone: true, fullName: true, address: true, extraPhones: true } },
  createdBy: { select: { id: true, fullName: true } },
  assignedOrgUnit: { select: { id: true, name: true, path: true } },
  assignee: { select: { id: true, fullName: true } },
  events: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { actor: { select: { id: true, fullName: true } }, orgUnit: { select: { id: true, name: true } } },
  },
  attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, uploadedBy: { select: { id: true, fullName: true } } }, orderBy: { createdAt: 'asc' } },
  smsMessages: { select: { id: true, phone: true, text: true, status: true, error: true, createdAt: true, deliveredAt: true }, orderBy: { createdAt: 'asc' } },
  duplicateOf: { select: { id: true, number: true, status: true, createdAt: true } },
  duplicates: { select: { id: true, number: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
  calls: { select: { id: true, startedAt: true, talkSeconds: true, result: true } },
  extraTopics: { select: { category: { select: { id: true, nameUz: true, sortOrder: true, parent: { select: { id: true, nameUz: true } } } } } },
  participants: {
    select: { createdAt: true, orgUnit: { select: { id: true, name: true } }, addedBy: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.TicketInclude;

/** Bitta eksportdagi eng ko'p qator: kattaroq hajm hisobotlar moduli orqali. */
const EXPORT_LIMIT = 10_000;

const overdueWhere = (): Prisma.TicketWhereInput => ({ dueAt: { lt: new Date() }, status: { not: TicketStatus.CLOSED } });

type VisibleTicket =Prisma.TicketGetPayload<{ include: { assignedOrgUnit: { select: { id: true; path: true } } } }>;

interface TransitionOptions {
  /** Audit jurnali uchun so'rov manbai (IP, brauzer) */
  meta?: RequestMeta;
  allowedFrom: TicketStatus[];
  to: TicketStatus;
  event: TicketEventType;
  comment?: string;
  orgUnitId?: number;
  data?: Prisma.TicketUncheckedUpdateManyInput;
}

@Injectable()
export class TicketsService {
  private readonly numberPrefix: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly sms: SmsService,
    private readonly ai: AiService,
    config: ConfigService,
  ) {
    this.numberPrefix = config.get<string>('TICKET_NUMBER_PREFIX') ?? '1097';
  }

  // ───────────── O'qish ─────────────

  /** Ro'yxat, sanoq va eksport uchun umumiy filtr. withStatus=false: holat tablarining sanog'i uchun. */
  private listWhere(user: AuthUser, query: TicketsQueryDto, withStatus = true): Prisma.TicketWhereInput {
    const and: Prisma.TicketWhereInput[] = [
      ticketScopeWhere(user),
      {
        status: withStatus ? query.status : undefined,
        type: query.type,
        channel: query.channel,
        regionId: query.regionId,
        assignedOrgUnitId: query.assignedOrgUnitId,
      },
    ];
    // Toifa tanlansa, uning mavzulari (quyi bandlari) bo'yicha murojaatlar ham kiradi
    if (query.categoryId) {
      and.push({ OR: [{ categoryId: query.categoryId }, { category: { parentId: query.categoryId } }] });
    }
    if (query.createdFrom || query.createdTo) {
      and.push({ createdAt: { gte: query.createdFrom, lte: query.createdTo } });
    }
    if (withStatus && query.overdue) {
      and.push(overdueWhere());
    }
    if (query.search) {
      const search = query.search.trim();
      and.push({
        OR: [
          { number: { contains: search, mode: 'insensitive' } },
          { subject: { contains: search, mode: 'insensitive' } },
          // Anonim murojaatlar telefon bo'yicha qidiruvda ko'rinmaydi
          { citizen: { phone: { contains: search.replace(/[^\d+]/g, '') } }, isAnonymous: false },
        ],
      });
    }
    return { AND: and };
  }

  async list(user: AuthUser, query: TicketsQueryDto): Promise<Page<Prisma.TicketGetPayload<{ select: typeof LIST_SELECT }>>> {
    const where = this.listWhere(user, query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({ where, select: LIST_SELECT, orderBy: { createdAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.ticket.count({ where }),
    ]);
    return {
      items: items.map((ticket) => this.hideAnonymous(user, ticket)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Holat tablari uchun sanoq: joriy filtrlar bo'yicha, holat tanlovisiz. */
  async counts(user: AuthUser, query: TicketsQueryDto) {
    const where = this.listWhere(user, query, false);
    const [groups, overdue] = await Promise.all([
      this.prisma.ticket.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.ticket.count({ where: { AND: [where, overdueWhere()] } }),
    ]);
    const byStatus: Partial<Record<TicketStatus, number>> = {};
    let total = 0;
    for (const group of groups) {
      byStatus[group.status] = group._count._all;
      total += group._count._all;
    }
    return { total, byStatus, overdue };
  }

  /**
   * Menyudagi "Murojaatlar" nishoni: foydalanuvchi amalini kutayotganlar — yo'naltirish (yangi va qaytarilgan),
   * taqsimlash (yo'naltirilgan), javob yozish (o'ziga biriktirilgan, ijroda) va tasdiqlash (javob tayyor).
   */
  async inboxCount(user: AuthUser): Promise<{ count: number }> {
    const waiting: Prisma.TicketWhereInput[] = [];
    if (hasPermission(user, Permission.TicketsRoute)) waiting.push({ status: { in: [TicketStatus.NEW, TicketStatus.RETURNED] } });
    if (hasPermission(user, Permission.TicketsAssign)) waiting.push({ status: TicketStatus.ROUTED });
    if (hasPermission(user, Permission.TicketsAnswer)) waiting.push({ status: TicketStatus.IN_PROGRESS, assigneeId: user.id });
    if (hasPermission(user, Permission.TicketsApprove)) waiting.push({ status: TicketStatus.ANSWERED });
    if (waiting.length === 0) return { count: 0 };
    return { count: await this.prisma.ticket.count({ where: { AND: [ticketScopeWhere(user), { OR: waiting }] } }) };
  }

  /** CSV eksport (joriy filtr, ko'pi bilan EXPORT_LIMIT qator). Shaxsiy ma'lumot chiqadi — audit jurnaliga yoziladi. */
  async exportCsv(user: AuthUser, query: TicketsQueryDto, meta: RequestMeta): Promise<string> {
    const rows = await this.prisma.ticket.findMany({
      where: this.listWhere(user, query),
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_LIMIT,
    });
    await this.audit.log({
      actorId: user.id,
      action: 'ticket.export',
      entityType: 'Ticket',
      entityId: 'list',
      details: { rows: rows.length, filters: { ...query, page: undefined, pageSize: undefined } },
      ...meta,
    });
    return ticketsToCsv(rows.map((ticket) => this.hideAnonymous(user, ticket)));
  }

  async get(user: AuthUser, id: number, meta: RequestMeta) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { AND: [{ id }, ticketScopeWhere(user)] },
      include: DETAIL_INCLUDE,
    });
    if (!ticket) throw new NotFoundException('Murojaat topilmadi');
    await this.audit.log({ actorId: user.id, action: 'ticket.view', entityType: 'Ticket', entityId: id, ...meta });
    return this.hideAnonymous(user, ticket);
  }

  /** Yo'naltirish jadvali bo'yicha mas'ul bo'linmani taklif qiladi (F-CRM-03). */
  async suggestRoute(ctx: RoutingContext) {
    const [rules, categoryId] = await Promise.all([
      this.prisma.routingRule.findMany({
        where: { isActive: true, targetOrgUnit: { isActive: true } },
        include: { targetOrgUnit: { select: { id: true, name: true } } },
      }),
      this.routingCategoryId(ctx.categoryId),
    ]);
    return pickBestRule(rules, { ...ctx, categoryId })?.targetOrgUnit ?? null;
  }

  /** Mavzu (quyi toifa) tanlansa, yo'naltirish jadvali uning ota toifasi bo'yicha qidiriladi. */
  private async routingCategoryId(categoryId?: number | null): Promise<number | null | undefined> {
    if (!categoryId) return categoryId;
    const category = await this.prisma.category.findUnique({ where: { id: categoryId }, select: { parentId: true } });
    return category?.parentId ?? categoryId;
  }

  // ───────────── Yaratish ─────────────

  async create(user: AuthUser, dto: CreateTicketDto, meta: RequestMeta) {
    if (dto.closeImmediately && dto.targetOrgUnitId) {
      throw new BadRequestException("Darhol yopiladigan murojaat bir vaqtda yo'naltirilmaydi");
    }
    if (dto.closeImmediately && !canCloseImmediately(dto.type)) {
      throw new BadRequestException("Faqat ma'lumot so'rash va minnatdorchilik murojaatlari darhol yopiladi");
    }

    const category = dto.categoryId
      ? await this.prisma.category.findFirst({ where: { id: dto.categoryId, isActive: true } })
      : null;
    if (dto.categoryId && !category) throw new BadRequestException('Toifa topilmadi');

    // Qo'shimcha mavzular: asosiysidan tashqari; maxfiy mavzu faqat asosiy bo'la oladi (yo'naltirish shunga bog'liq)
    const extraTopicIds = [...new Set(dto.topicIds ?? [])].filter((id) => id !== category?.id);
    if (extraTopicIds.length > 0) {
      const extras = await this.prisma.category.findMany({ where: { id: { in: extraTopicIds }, isActive: true }, select: { isConfidential: true } });
      if (extras.length !== extraTopicIds.length) throw new BadRequestException("Qo'shimcha mavzulardan biri topilmadi");
      if (!category?.isConfidential && extras.some((e) => e.isConfidential)) {
        throw new BadRequestException('Maxfiy mavzu (korrupsiya) asosiy mavzu sifatida tanlanadi');
      }
    }

    const isConfidential = dto.type === TicketType.CORRUPTION || (category?.isConfidential ?? false);
    let targetOrgUnitId = dto.targetOrgUnitId ?? null;
    // Maxfiy murojaat yaratilgan zahoti operator ko'rinishidan chiqadi, shuning uchun darhol yo'naltiriladi
    if (!targetOrgUnitId && isConfidential) {
      targetOrgUnitId = (await this.suggestRoute(dto))?.id ?? null;
    }
    if (targetOrgUnitId) await this.assertActiveOrgUnit(targetOrgUnitId);

    const phone = dto.citizenPhone ? normalizePhone(dto.citizenPhone) : null;
    const extraPhones = [...new Set((dto.extraPhones ?? []).map(normalizePhone))].filter((p) => /^\+\d{11,15}$/.test(p) && p !== phone);
    if ((dto.extraPhones?.length ?? 0) > 0 && !phone) throw new BadRequestException("Qo'shimcha raqam fuqaroning asosiy raqami bilan birga kiritiladi");
    const now = new Date();
    // Muddat oxiri dam olish yoki bayram kuniga to'g'ri kelsa, keyingi ish kuniga suriladi
    const calendar = await loadWorkCalendar(this.prisma, this.settings);
    const status = dto.closeImmediately
      ? TicketStatus.CLOSED
      : targetOrgUnitId
        ? TicketStatus.ROUTED
        : TicketStatus.NEW;

    const events: Prisma.TicketEventUncheckedCreateWithoutTicketInput[] = [
      { actorId: user.id, type: TicketEventType.CREATED, toStatus: TicketStatus.NEW },
    ];
    if (targetOrgUnitId) {
      events.push({
        actorId: user.id,
        type: TicketEventType.ROUTED,
        fromStatus: TicketStatus.NEW,
        toStatus: TicketStatus.ROUTED,
        orgUnitId: targetOrgUnitId,
      });
    }
    if (dto.closeImmediately) {
      events.push({
        actorId: user.id,
        type: TicketEventType.CLOSED,
        fromStatus: TicketStatus.NEW,
        toStatus: TicketStatus.CLOSED,
        comment: "Ma'lumot berildi",
      });
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      const existing = phone ? await tx.citizen.findUnique({ where: { phone }, select: { extraPhones: true } }) : null;
      const citizen = phone
        ? await tx.citizen.upsert({
            where: { phone },
            update: {
              fullName: dto.citizenName || undefined,
              extraPhones: extraPhones.length > 0 ? [...new Set([...(existing?.extraPhones ?? []), ...extraPhones])] : undefined,
            },
            create: { phone, fullName: dto.citizenName, regionId: dto.regionId, districtId: dto.districtId, extraPhones },
          })
        : null;

      const created = await tx.ticket.create({
        data: {
          number: await this.nextNumber(tx),
          channel: dto.channel ?? TicketChannel.PHONE,
          type: dto.type,
          status,
          categoryId: category?.id,
          citizenId: citizen?.id,
          isAnonymous: dto.isAnonymous ?? false,
          isConfidential,
          regionId: dto.regionId,
          districtId: dto.districtId,
          subject: dto.subject,
          description: dto.description,
          cadastreNumber: dto.cadastreNumber,
          applicationNumber: dto.applicationNumber,
          createdById: user.id,
          assignedOrgUnitId: targetOrgUnitId,
          dueAt: dto.closeImmediately ? null : computeDueAt(now, category?.slaDays ?? DEFAULT_SLA_DAYS, calendar),
          answer: dto.closeImmediately ? dto.answer : undefined,
          answeredAt: dto.closeImmediately ? now : undefined,
          closedAt: dto.closeImmediately ? now : undefined,
          events: { create: events },
          extraTopics: extraTopicIds.length > 0 ? { create: extraTopicIds.map((categoryId) => ({ categoryId })) } : undefined,
        },
        select: LIST_SELECT,
      });

      if (dto.pbxCallId) {
        await tx.call.updateMany({
          where: { pbxCallId: dto.pbxCallId },
          data: { ticketId: created.id, citizenId: citizen?.id },
        });
      }
      return created;
    });

    await this.audit.log({
      actorId: user.id,
      action: 'ticket.create',
      entityType: 'Ticket',
      entityId: ticket.id,
      details: { number: ticket.number, status },
      ...meta,
    });
    if (!dto.isAnonymous) await this.linkDuplicate(ticket.id).catch(() => undefined);
    // F-AI-04: korrupsiya, tahdid va h.k. kalit so'zlari — belgi va mas'ullarga xabar
    await this.ai.flagTicket(ticket.id).catch(() => undefined);
    // F-CRM-02, F-NOT-01: murojaat raqami fuqaroga SMS orqali (sozlamada yoqilgan bo'lsa)
    if ((await this.settings.get('automation')).smsOnCreate) await this.smsCitizen(ticket, 'ticket_created');
    return ticket;
  }

  /** Fuqaroga shablon bo'yicha SMS; anonim murojaatga yuborilmaydi. Xato murojaat amalini to'xtatmaydi. */
  private async smsCitizen(
    ticket: { id: number; number: string; isAnonymous: boolean; citizen: { id: number; phone: string } | null },
    template: 'ticket_created' | 'ticket_closed',
  ): Promise<void> {
    if (ticket.isAnonymous || !ticket.citizen) return;
    try {
      const text = await this.sms.template(template, { raqam: ticket.number });
      await this.sms.send({ phone: ticket.citizen.phone, text, template, citizenId: ticket.citizen.id, ticketId: ticket.id });
    } catch {
      /* SMS navbati o'zi qayta urinadi */
    }
  }

  /**
   * Takroriy murojaat (F-CRM-08): shu fuqaroning shu mavzudagi oldingi murojaati sozlamadagi oraliqda
   * (standart 30 kun) bo'lsa, asl murojaatga bog'lanadi. Takrorlar soni chegaraga yetsa — supervisorlarga xabar.
   */
  private async linkDuplicate(ticketId: number): Promise<void> {
    const settings = (await this.settings.get('automation')).duplicateDetection;
    if (!settings.enabled) return;
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, number: true, citizenId: true, categoryId: true, createdAt: true, subject: true },
    });
    if (!ticket?.citizenId || !ticket.categoryId) return;
    const since = new Date(ticket.createdAt.getTime() - settings.windowHours * 3600_000);
    const previous = await this.prisma.ticket.findFirst({
      where: { id: { not: ticket.id }, citizenId: ticket.citizenId, categoryId: ticket.categoryId, isAnonymous: false, createdAt: { gte: since, lte: ticket.createdAt } },
      select: { id: true, duplicateOfId: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!previous) return;
    const original = await this.prisma.ticket.findUniqueOrThrow({ where: { id: previous.duplicateOfId ?? previous.id }, select: { id: true, number: true } });
    await this.prisma.$transaction([
      this.prisma.ticket.update({ where: { id: ticket.id }, data: { duplicateOfId: original.id } }),
      this.prisma.ticketEvent.create({ data: { ticketId: ticket.id, type: TicketEventType.COMMENT, comment: `Takroriy murojaat: asl murojaat № ${original.number}` } }),
      this.prisma.ticketEvent.create({ data: { ticketId: original.id, type: TicketEventType.COMMENT, comment: `Fuqaro shu mavzuda qayta murojaat qildi: № ${ticket.number}` } }),
    ]);
    const repeats = await this.prisma.ticket.count({ where: { OR: [{ id: original.id }, { duplicateOfId: original.id }], createdAt: { gte: since } } });
    if (repeats >= settings.minTickets) {
      await this.notifications.notifyUsers(await this.notifications.supervisors(), {
        type: 'ticket.duplicate',
        title: `Takroriy murojaat (${repeats} marta): ${original.number}`,
        body: `Fuqaro bir mavzuda ${repeats} marta murojaat qildi — ${ticket.subject}`,
        link: `/tickets/${original.id}`,
      });
    }
  }

  // ───────────── Holat o'zgarishlari ─────────────

  async route(user: AuthUser, id: number, dto: RouteTicketDto, meta?: RequestMeta) {
    await this.assertActiveOrgUnit(dto.orgUnitId);
    const ticket = await this.findVisible(user, id);
    return this.transition(user, ticket, {
      meta,
      allowedFrom: [TicketStatus.NEW, TicketStatus.RETURNED],
      to: TicketStatus.ROUTED,
      event: TicketEventType.ROUTED,
      orgUnitId: dto.orgUnitId,
      comment: dto.comment,
      data: { assignedOrgUnitId: dto.orgUnitId, assigneeId: null },
    });
  }

  async assign(user: AuthUser, id: number, dto: AssignTicketDto, meta?: RequestMeta) {
    const ticket = await this.findVisible(user, id);
    this.assertManages(user, ticket);
    const assignee = await this.prisma.user.findFirst({
      where: {
        id: dto.assigneeId,
        isActive: true,
        orgUnit: { path: { startsWith: ticket.assignedOrgUnit?.path ?? '-' } },
      },
      select: { id: true },
    });
    if (!assignee) throw new BadRequestException("Ijrochi shu bo'linma xodimi bo'lishi kerak");

    const updated = await this.transition(user, ticket, {
      meta,
      allowedFrom: [TicketStatus.ROUTED],
      to: TicketStatus.IN_PROGRESS,
      event: TicketEventType.ASSIGNED,
      comment: dto.comment,
      data: { assigneeId: assignee.id },
    });
    await this.notify(assignee.id, 'ticket.assigned', `Yangi murojaat: ${updated.number}`, updated.subject, updated.id);
    return updated;
  }

  async returnTicket(user: AuthUser, id: number, comment: string, meta?: RequestMeta) {
    const ticket = await this.findVisible(user, id);
    this.assertManages(user, ticket);
    const updated = await this.transition(user, ticket, {
      meta,
      allowedFrom: [TicketStatus.ROUTED],
      to: TicketStatus.RETURNED,
      event: TicketEventType.RETURNED,
      comment,
      data: { assignedOrgUnitId: null, assigneeId: null },
    });
    // Qaytarilgan murojaat yaratgan operatorga va (sozlamada yoqilgan bo'lsa) supervisorlar navbatiga
    const { returnToSupervisor } = await this.settings.get('automation');
    const recipients = [...(ticket.createdById ? [ticket.createdById] : []), ...(returnToSupervisor ? await this.notifications.supervisors() : [])];
    await this.notifications.notifyUsers(recipients, { type: 'ticket.returned', title: `Murojaat qaytarildi: ${updated.number}`, body: comment, link: `/tickets/${updated.id}` });
    return updated;
  }

  async answer(user: AuthUser, id: number, dto: AnswerTicketDto, meta?: RequestMeta) {
    const ticket = await this.findVisible(user, id);
    const isAssignee = ticket.assigneeId === user.id;
    const isManager = hasPermission(user, Permission.TicketsAssign) && managesOrgUnit(user, ticket.assignedOrgUnit?.path);
    if (!isAssignee && !isManager) throw new ForbiddenException('Javobni faqat ijrochi yoki bo\'linma rahbari yozadi');
    return this.transition(user, ticket, {
      meta,
      allowedFrom: [TicketStatus.IN_PROGRESS],
      to: TicketStatus.ANSWERED,
      event: TicketEventType.ANSWERED,
      data: { answer: dto.answer, answeredAt: new Date() },
    });
  }

  async approve(user: AuthUser, id: number, meta?: RequestMeta) {
    const ticket = await this.findVisible(user, id);
    this.assertManages(user, ticket);
    const updated = await this.transition(user, ticket, {
      meta,
      allowedFrom: [TicketStatus.ANSWERED],
      to: TicketStatus.CLOSED,
      event: TicketEventType.APPROVED,
      data: { closedAt: new Date() },
    });
    // F-CRM-07: natija fuqaroga SMS orqali; batafsil javob 1097 yoki qayta qo'ng'iroq kampaniyasi orqali
    await this.smsCitizen(updated, 'ticket_closed');
    return updated;
  }

  async reject(user: AuthUser, id: number, comment: string, meta?: RequestMeta) {
    const ticket = await this.findVisible(user, id);
    this.assertManages(user, ticket);
    const updated = await this.transition(user, ticket, {
      meta,
      allowedFrom: [TicketStatus.ANSWERED],
      to: TicketStatus.IN_PROGRESS,
      event: TicketEventType.REJECTED,
      comment,
    });
    if (ticket.assigneeId) {
      await this.notify(ticket.assigneeId, 'ticket.rejected', `Javob qaytarildi: ${updated.number}`, comment, updated.id);
    }
    return updated;
  }

  async reopen(user: AuthUser, id: number, comment: string, meta?: RequestMeta) {
    const ticket = await this.findVisible(user, id);
    if (!ticket.assigneeId) {
      throw new BadRequestException('Bu murojaat ijroga yuborilmasdan yopilgan; yangi murojaat yarating');
    }
    return this.transition(user, ticket, {
      meta,
      allowedFrom: [TicketStatus.CLOSED],
      to: TicketStatus.IN_PROGRESS,
      event: TicketEventType.REOPENED,
      comment,
      data: { closedAt: null },
    });
  }

  async addComment(user: AuthUser, id: number, comment: string) {
    const ticket = await this.findVisible(user, id);
    return this.prisma.ticketEvent.create({
      data: { ticketId: ticket.id, actorId: user.id, type: TicketEventType.COMMENT, comment },
      include: { actor: { select: { id: true, fullName: true } } },
    });
  }

  // ───────────── Yordamchi metodlar ─────────────

  private async transition(user: AuthUser, ticket: VisibleTicket, opts: TransitionOptions) {
    if (!opts.allowedFrom.includes(ticket.status) || !canTransition(ticket.status, opts.to)) {
      throw new ConflictException(
        `"${STATUS_LABELS[ticket.status]}" holatidagi murojaatni "${STATUS_LABELS[opts.to]}" holatiga o'tkazib bo'lmaydi`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Optimistik qulf: holat shu orada boshqa foydalanuvchi tomonidan o'zgargan bo'lsa, hech narsa yozilmaydi
      const result = await tx.ticket.updateMany({
        where: { id: ticket.id, status: ticket.status },
        data: { ...opts.data, status: opts.to },
      });
      if (result.count === 0) {
        throw new ConflictException("Murojaat boshqa foydalanuvchi tomonidan o'zgartirildi, sahifani yangilang");
      }
      await tx.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: user.id,
          type: opts.event,
          fromStatus: ticket.status,
          toStatus: opts.to,
          orgUnitId: opts.orgUnitId,
          comment: opts.comment,
        },
      });
      return tx.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: LIST_SELECT });
    });
    await this.auditTransition(user, ticket, updated, opts);
    return updated;
  }

  /** Holat o'zgarishi audit jurnaliga: avval → keyin (holat, bo'linma, ijrochi), kim va qayerdan. */
  private async auditTransition(
    user: AuthUser,
    before: VisibleTicket,
    after: Prisma.TicketGetPayload<{ select: typeof LIST_SELECT }>,
    opts: TransitionOptions,
  ): Promise<void> {
    const changes: Record<string, { from: string | null; to: string | null }> = {
      status: { from: STATUS_LABELS[before.status], to: STATUS_LABELS[after.status] },
    };
    if ((before.assignedOrgUnit?.id ?? null) !== (after.assignedOrgUnit?.id ?? null)) {
      const from = before.assignedOrgUnit ? await this.prisma.orgUnit.findUnique({ where: { id: before.assignedOrgUnit.id }, select: { name: true } }) : null;
      changes.orgUnit = { from: from?.name ?? null, to: after.assignedOrgUnit?.name ?? null };
    }
    if (before.assigneeId !== (after.assignee?.id ?? null)) {
      const from = before.assigneeId ? await this.prisma.user.findUnique({ where: { id: before.assigneeId }, select: { fullName: true } }) : null;
      changes.assignee = { from: from?.fullName ?? null, to: after.assignee?.fullName ?? null };
    }
    await this.audit.log({
      actorId: user.id,
      action: 'ticket.transition',
      entityType: 'Ticket',
      entityId: before.id,
      details: { number: after.number, event: opts.event, changes, ...(opts.comment ? { comment: opts.comment } : {}) },
      ...opts.meta,
    });
  }

  private async findVisible(user: AuthUser, id: number): Promise<VisibleTicket> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { AND: [{ id }, ticketScopeWhere(user)] },
      include: { assignedOrgUnit: { select: { id: true, path: true } } },
    });
    if (!ticket) throw new NotFoundException('Murojaat topilmadi');
    return ticket;
  }

  private assertManages(user: AuthUser, ticket: VisibleTicket): void {
    if (!managesOrgUnit(user, ticket.assignedOrgUnit?.path)) {
      throw new ForbiddenException("Bu murojaat sizning bo'linmangizga tegishli emas");
    }
  }

  private async assertActiveOrgUnit(id: number): Promise<void> {
    const unit = await this.prisma.orgUnit.findFirst({ where: { id, isActive: true }, select: { id: true } });
    if (!unit) throw new BadRequestException("Bo'linma topilmadi yoki faol emas");
  }

  /** Yillik hisoblagich: bir vaqtdagi so'rovlarda ham raqamlar takrorlanmaydi. */
  private async nextNumber(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO ticket_counters (year, value) VALUES (${year}, 1)
      ON CONFLICT (year) DO UPDATE SET value = ticket_counters.value + 1
      RETURNING value`;
    return formatTicketNumber(this.numberPrefix, year, rows[0].value);
  }

  private async notify(userId: number, type: string, title: string, body: string, ticketId: number): Promise<void> {
    await this.notifications.notifyUsers([userId], { type, title, body, link: `/tickets/${ticketId}` });
  }

  private hideAnonymous<T extends { isAnonymous: boolean; citizen: unknown }>(user: AuthUser, ticket: T): T {
    if (ticket.isAnonymous && !hasPermission(user, Permission.TicketsConfidential)) {
      return { ...ticket, citizen: null };
    }
    return ticket;
  }
}
