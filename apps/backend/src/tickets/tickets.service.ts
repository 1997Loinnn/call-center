import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TicketChannel, TicketEventType, TicketStatus, TicketType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { hasPermission, managesOrgUnit, ticketScopeWhere } from '../common/data-scope';
import { Page, pageArgs, RequestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { pickBestRule, RoutingContext } from './routing';
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
  category: { select: { id: true, nameUz: true, slaDays: true } },
  region: { select: { id: true, nameUz: true } },
  district: { select: { id: true, nameUz: true } },
  citizen: { select: { id: true, phone: true, fullName: true, address: true } },
  createdBy: { select: { id: true, fullName: true } },
  assignedOrgUnit: { select: { id: true, name: true, path: true } },
  assignee: { select: { id: true, fullName: true } },
  events: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { actor: { select: { id: true, fullName: true } }, orgUnit: { select: { id: true, name: true } } },
  },
  attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } },
  calls: { select: { id: true, startedAt: true, talkSeconds: true, result: true } },
} satisfies Prisma.TicketInclude;

type VisibleTicket = Prisma.TicketGetPayload<{ include: { assignedOrgUnit: { select: { id: true; path: true } } } }>;

interface TransitionOptions {
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
    config: ConfigService,
  ) {
    this.numberPrefix = config.get<string>('TICKET_NUMBER_PREFIX') ?? '1097';
  }

  // ───────────── O'qish ─────────────

  async list(user: AuthUser, query: TicketsQueryDto): Promise<Page<Prisma.TicketGetPayload<{ select: typeof LIST_SELECT }>>> {
    const and: Prisma.TicketWhereInput[] = [
      ticketScopeWhere(user),
      {
        status: query.status,
        type: query.type,
        categoryId: query.categoryId,
        regionId: query.regionId,
        assignedOrgUnitId: query.assignedOrgUnitId,
      },
    ];
    if (query.overdue) {
      and.push({ dueAt: { lt: new Date() }, status: { not: TicketStatus.CLOSED } });
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

    const where: Prisma.TicketWhereInput = { AND: and };
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

    const isConfidential = dto.type === TicketType.CORRUPTION || (category?.isConfidential ?? false);
    let targetOrgUnitId = dto.targetOrgUnitId ?? null;
    // Maxfiy murojaat yaratilgan zahoti operator ko'rinishidan chiqadi, shuning uchun darhol yo'naltiriladi
    if (!targetOrgUnitId && isConfidential) {
      targetOrgUnitId = (await this.suggestRoute(dto))?.id ?? null;
    }
    if (targetOrgUnitId) await this.assertActiveOrgUnit(targetOrgUnitId);

    const phone = dto.citizenPhone ? normalizePhone(dto.citizenPhone) : null;
    const now = new Date();
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
      const citizen = phone
        ? await tx.citizen.upsert({
            where: { phone },
            update: { fullName: dto.citizenName || undefined },
            create: { phone, fullName: dto.citizenName, regionId: dto.regionId, districtId: dto.districtId },
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
          dueAt: dto.closeImmediately ? null : computeDueAt(now, category?.slaDays ?? DEFAULT_SLA_DAYS),
          answer: dto.closeImmediately ? dto.answer : undefined,
          answeredAt: dto.closeImmediately ? now : undefined,
          closedAt: dto.closeImmediately ? now : undefined,
          events: { create: events },
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
    // TODO(F-NOT-01): fuqaroga SMS — "Murojaatingiz №... qabul qilindi"
    return ticket;
  }

  // ───────────── Holat o'zgarishlari ─────────────

  async route(user: AuthUser, id: number, dto: RouteTicketDto) {
    await this.assertActiveOrgUnit(dto.orgUnitId);
    const ticket = await this.findVisible(user, id);
    return this.transition(user, ticket, {
      allowedFrom: [TicketStatus.NEW, TicketStatus.RETURNED],
      to: TicketStatus.ROUTED,
      event: TicketEventType.ROUTED,
      orgUnitId: dto.orgUnitId,
      comment: dto.comment,
      data: { assignedOrgUnitId: dto.orgUnitId, assigneeId: null },
    });
  }

  async assign(user: AuthUser, id: number, dto: AssignTicketDto) {
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
      allowedFrom: [TicketStatus.ROUTED],
      to: TicketStatus.IN_PROGRESS,
      event: TicketEventType.ASSIGNED,
      comment: dto.comment,
      data: { assigneeId: assignee.id },
    });
    await this.notify(assignee.id, 'ticket.assigned', `Yangi murojaat: ${updated.number}`, updated.subject, updated.id);
    return updated;
  }

  async returnTicket(user: AuthUser, id: number, comment: string) {
    const ticket = await this.findVisible(user, id);
    this.assertManages(user, ticket);
    return this.transition(user, ticket, {
      allowedFrom: [TicketStatus.ROUTED],
      to: TicketStatus.RETURNED,
      event: TicketEventType.RETURNED,
      comment,
      data: { assignedOrgUnitId: null, assigneeId: null },
    });
  }

  async answer(user: AuthUser, id: number, dto: AnswerTicketDto) {
    const ticket = await this.findVisible(user, id);
    const isAssignee = ticket.assigneeId === user.id;
    const isManager = hasPermission(user, Permission.TicketsAssign) && managesOrgUnit(user, ticket.assignedOrgUnit?.path);
    if (!isAssignee && !isManager) throw new ForbiddenException('Javobni faqat ijrochi yoki bo\'linma rahbari yozadi');
    return this.transition(user, ticket, {
      allowedFrom: [TicketStatus.IN_PROGRESS],
      to: TicketStatus.ANSWERED,
      event: TicketEventType.ANSWERED,
      data: { answer: dto.answer, answeredAt: new Date() },
    });
  }

  async approve(user: AuthUser, id: number) {
    const ticket = await this.findVisible(user, id);
    this.assertManages(user, ticket);
    // TODO(F-CRM-07): natijani fuqaroga SMS yoki qayta qo'ng'iroq orqali ma'lum qilish
    return this.transition(user, ticket, {
      allowedFrom: [TicketStatus.ANSWERED],
      to: TicketStatus.CLOSED,
      event: TicketEventType.APPROVED,
      data: { closedAt: new Date() },
    });
  }

  async reject(user: AuthUser, id: number, comment: string) {
    const ticket = await this.findVisible(user, id);
    this.assertManages(user, ticket);
    const updated = await this.transition(user, ticket, {
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

  async reopen(user: AuthUser, id: number, comment: string) {
    const ticket = await this.findVisible(user, id);
    if (!ticket.assigneeId) {
      throw new BadRequestException('Bu murojaat ijroga yuborilmasdan yopilgan; yangi murojaat yarating');
    }
    return this.transition(user, ticket, {
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

    return this.prisma.$transaction(async (tx) => {
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
    const link = `/tickets/${ticketId}`;
    await this.prisma.notification.create({ data: { userId, type, title, body, link } });
    this.realtime.emitToUser(userId, 'notification', { type, title, body, link });
  }

  private hideAnonymous<T extends { isAnonymous: boolean; citizen: unknown }>(user: AuthUser, ticket: T): T {
    if (ticket.isAnonymous && !hasPermission(user, Permission.TicketsConfidential)) {
      return { ...ticket, citizen: null };
    }
    return ticket;
  }
}
