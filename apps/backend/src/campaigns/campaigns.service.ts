import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CallDirection, Campaign, CampaignContactStatus, CampaignStatus, CampaignType, Prisma, TicketStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { TelephonyService } from '../telephony/telephony.service';
import {
  CAMPAIGN_STATUS_LABELS,
  canChangeCampaign,
  CLAIM_MINUTES,
  contactOutcome,
  OPEN_CONTACT_STATUSES,
  SKIP_MINUTES,
} from './campaign-rules';
import { ContactResultDto, ContactsSourceDto, CreateCampaignDto, UpdateCampaignDto } from './campaigns.dto';

const CONTACT_SELECT = {
  id: true,
  phone: true,
  fullName: true,
  status: true,
  attempts: true,
  lastAttemptAt: true,
  nextAttemptAt: true,
  resolved: true,
  rating: true,
  note: true,
  agentId: true,
  citizen: { select: { id: true, fullName: true } },
  ticket: { select: { id: true, number: true, subject: true, closedAt: true } },
  call: { select: { id: true, talkSeconds: true, startedAt: true } },
} satisfies Prisma.CampaignContactSelect;

/** Bitta kampaniyaga bir yuklashda ko'pi bilan shuncha murojaatdan kontakt olinadi. */
const TICKET_SOURCE_LIMIT = 5_000;

const isPhone = (phone: string) => /^\+998\d{9}$/.test(phone);

/**
 * Chiquvchi kampaniyalar (prototip: Kampaniyalar artboardi): qayta aloqa, sifat so'rovnomasi, eslatma va
 * xabardor qilish. Operator "ko'rib chiqib terish" rejimida ishlaydi: kontaktni oladi, PBX orqali qo'ng'iroq
 * qiladi va natijani yozadi. Javob bermagan raqamlarga keyinroq qayta qo'ng'iroq rejalashtiriladi.
 */
@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telephony: TelephonyService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Ro'yxat ─────────────

  async list() {
    const campaigns = await this.prisma.campaign.findMany({
      orderBy: [{ createdAt: 'desc' }],
      include: { queue: { select: { id: true, pbxNumber: true, name: true } }, createdBy: { select: { id: true, fullName: true } } },
    });
    const stats = await this.stats(campaigns.map((c) => c.id));
    return campaigns.map((c) => ({ ...c, stats: stats.get(c.id) ?? this.emptyStats() }));
  }

  async get(id: number, user: AuthUser) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: { queue: { select: { id: true, pbxNumber: true, name: true } }, createdBy: { select: { id: true, fullName: true } } },
    });
    if (!campaign) throw new NotFoundException('Kampaniya topilmadi');
    const now = new Date();
    const [stats, upcoming, recent, current] = await Promise.all([
      this.stats([id]),
      this.prisma.campaignContact.findMany({
        where: this.callableWhere(campaign, now),
        select: { id: true, phone: true, fullName: true, attempts: true, status: true },
        orderBy: [{ nextAttemptAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
        take: 5,
      }),
      this.prisma.campaignContact.findMany({
        where: { campaignId: id, agentId: user.id, lastAttemptAt: { not: null }, status: { not: CampaignContactStatus.PENDING } },
        select: CONTACT_SELECT,
        orderBy: { lastAttemptAt: 'desc' },
        take: 8,
      }),
      this.claimedBy(campaign, user, now),
    ]);
    return { ...campaign, stats: stats.get(id) ?? this.emptyStats(), upcoming, recent, current };
  }

  // ───────────── Boshqarish (campaigns.manage) ─────────────

  async create(user: AuthUser, dto: CreateCampaignDto) {
    if (dto.startsAt && dto.endsAt && dto.endsAt <= dto.startsAt) throw new BadRequestException("Tugash sanasi boshlanishdan keyin bo'lishi kerak");
    const queue = await this.prisma.queue.findUnique({ where: { pbxNumber: '6510' }, select: { id: true } });
    const campaign = await this.prisma.campaign.create({
      data: {
        name: dto.name.trim(),
        type: dto.type,
        status: dto.status,
        description: dto.description?.trim() || null,
        script: dto.script?.trim() || null,
        maxAttempts: dto.maxAttempts,
        startsAt: dto.startsAt ?? (dto.status === CampaignStatus.ACTIVE ? new Date() : null),
        endsAt: dto.endsAt ?? null,
        queueId: queue?.id,
        createdById: user.id,
      },
    });
    const added = await this.addContacts(campaign.id, dto);
    await this.audit.log({
      actorId: user.id,
      action: 'campaign.create',
      entityType: 'Campaign',
      entityId: campaign.id,
      details: { name: campaign.name, type: campaign.type, status: campaign.status, contacts: added.added },
    });
    return { campaign, ...added };
  }

  async update(user: AuthUser, id: number, dto: UpdateCampaignDto) {
    const before = await this.prisma.campaign.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Kampaniya topilmadi');
    if (dto.status && !canChangeCampaign(before.status, dto.status)) {
      throw new ConflictException(`"${CAMPAIGN_STATUS_LABELS[before.status]}" holatidagi kampaniyani "${CAMPAIGN_STATUS_LABELS[dto.status]}" qilib bo'lmaydi`);
    }
    const starting = dto.status === CampaignStatus.ACTIVE && before.status !== CampaignStatus.ACTIVE;
    const finishing = dto.status === CampaignStatus.COMPLETED || dto.status === CampaignStatus.CANCELLED;
    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description,
        script: dto.script,
        maxAttempts: dto.maxAttempts,
        status: dto.status,
        startsAt: starting && !before.startsAt ? new Date() : undefined,
        endsAt: finishing ? new Date() : undefined,
      },
    });
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (dto.status && dto.status !== before.status) changes.status = { from: CAMPAIGN_STATUS_LABELS[before.status], to: CAMPAIGN_STATUS_LABELS[dto.status] };
    if (dto.name && dto.name.trim() !== before.name) changes.name = { from: before.name, to: dto.name.trim() };
    if (dto.maxAttempts && dto.maxAttempts !== before.maxAttempts) changes.maxAttempts = { from: before.maxAttempts, to: dto.maxAttempts };
    if (Object.keys(changes).length > 0) {
      await this.audit.log({
        actorId: user.id,
        action: 'campaign.update',
        entityType: 'Campaign',
        entityId: id,
        details: { name: before.name, changes } as unknown as Prisma.InputJsonValue,
      });
    }
    return campaign;
  }

  async importContacts(user: AuthUser, id: number, dto: ContactsSourceDto) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Kampaniya topilmadi');
    if (campaign.status === CampaignStatus.COMPLETED || campaign.status === CampaignStatus.CANCELLED) {
      throw new ConflictException("Yakunlangan kampaniyaga kontakt qo'shilmaydi");
    }
    const result = await this.addContacts(id, dto);
    await this.audit.log({ actorId: user.id, action: 'campaign.contacts', entityType: 'Campaign', entityId: id, details: { name: campaign.name, ...result } });
    return result;
  }

  // ───────────── Operator ish oqimi (telephony.use) ─────────────

  /** Navbatdagi kontaktni operatorga biriktiradi (CLAIM_MINUTES davomida boshqalarga berilmaydi). */
  async next(user: AuthUser, id: number) {
    const campaign = await this.activeCampaign(id);
    const now = new Date();
    const held = await this.claimedBy(campaign, user, now);
    if (held) return held;
    const until = new Date(now.getTime() + CLAIM_MINUTES * 60_000);
    // Bir vaqtda bir nechta operator so'rasa: shartli UPDATE — kontaktni faqat bittasi oladi
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidates = await this.prisma.campaignContact.findMany({
        where: this.callableWhere(campaign, now),
        select: { id: true, nextAttemptAt: true },
        orderBy: [{ nextAttemptAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
        take: 5,
      });
      if (candidates.length === 0) return null;
      for (const c of candidates) {
        const { count } = await this.prisma.campaignContact.updateMany({
          where: { id: c.id, nextAttemptAt: c.nextAttemptAt },
          data: { agentId: user.id, nextAttemptAt: until },
        });
        if (count === 1) return this.prisma.campaignContact.findUnique({ where: { id: c.id }, select: CONTACT_SELECT });
      }
    }
    return null;
  }

  async skip(user: AuthUser, id: number, contactId: number) {
    const contact = await this.ownContact(user, id, contactId);
    await this.prisma.campaignContact.update({
      where: { id: contact.id },
      data: { agentId: null, nextAttemptAt: new Date(Date.now() + SKIP_MINUTES * 60_000) },
    });
  }

  /** Kontaktga operator ichki raqamidan qo'ng'iroq (click-to-call); urinish hisoblanadi. */
  async call(user: AuthUser, id: number, contactId: number) {
    const contact = await this.ownContact(user, id, contactId);
    await this.telephony.originate(user, contact.phone);
    return this.prisma.campaignContact.update({
      where: { id: contact.id },
      data: { attempts: { increment: 1 }, lastAttemptAt: new Date() },
      select: CONTACT_SELECT,
    });
  }

  async result(user: AuthUser, id: number, contactId: number, dto: ContactResultDto) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Kampaniya topilmadi');
    const contact = await this.ownContact(user, id, contactId);
    const now = new Date();
    // "Qo'ng'iroq qilish" bosilgan bo'lsa urinish allaqachon hisoblangan (kontakt olingandan keyin);
    // qo'ng'iroq PBX'dan tashqarida (qo'lda) qilingan bo'lsa ham urinish hisoblanadi
    const claimedAt = contact.nextAttemptAt ? contact.nextAttemptAt.getTime() - CLAIM_MINUTES * 60_000 : now.getTime();
    const attempts = contact.lastAttemptAt && contact.lastAttemptAt.getTime() >= claimedAt ? contact.attempts : contact.attempts + 1;
    const outcome = contactOutcome(dto.status, attempts, campaign.maxAttempts, now, dto.callLaterAt);
    // Operatorning shu raqamga oxirgi chiquvchi qo'ng'irog'i (yozuv va davomiylik uchun)
    const call = await this.prisma.call.findFirst({
      where: { agentId: user.id, direction: CallDirection.OUTBOUND, calledNumber: contact.phone, startedAt: { gte: new Date(now.getTime() - 60 * 60_000) } },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    const reached = dto.status === CampaignContactStatus.REACHED;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.campaignContact.update({
        where: { id: contact.id },
        data: {
          status: outcome.status,
          nextAttemptAt: outcome.nextAttemptAt,
          attempts,
          lastAttemptAt: now,
          agentId: user.id,
          callId: call?.id ?? contact.callId,
          resolved: reached ? dto.resolved ?? null : undefined,
          rating: reached ? dto.rating ?? null : undefined,
          note: dto.note?.trim() || undefined,
        },
        select: CONTACT_SELECT,
      });
      // So'rovnoma bahosi xizmat sifati hisobotlari uchun surveys jadvaliga ham yoziladi
      if (reached && campaign.type === CampaignType.SURVEY && dto.rating) {
        const hasSurvey = call ? await tx.survey.findUnique({ where: { callId: call.id }, select: { id: true } }) : null;
        if (!hasSurvey) await tx.survey.create({ data: { callId: call?.id, ticketId: contact.ticketId, score: dto.rating } });
      }
      const open = await tx.campaignContact.count({ where: { campaignId: id, status: { in: OPEN_CONTACT_STATUSES } } });
      if (open === 0 && campaign.status === CampaignStatus.ACTIVE) {
        await tx.campaign.update({ where: { id }, data: { status: CampaignStatus.COMPLETED, endsAt: now } });
      }
      return row;
    });
    return updated;
  }

  // ───────────── Yordamchi metodlar ─────────────

  private callableWhere(campaign: Campaign, now: Date): Prisma.CampaignContactWhereInput {
    return {
      campaignId: campaign.id,
      status: { in: OPEN_CONTACT_STATUSES },
      attempts: { lt: campaign.maxAttempts },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    };
  }

  /** Operator hali natija yozmagan, o'ziga olgan kontakti (sahifa yangilansa ham saqlanadi). */
  private claimedBy(campaign: Campaign, user: AuthUser, now: Date) {
    if (campaign.status !== CampaignStatus.ACTIVE) return Promise.resolve(null);
    return this.prisma.campaignContact.findFirst({
      where: {
        campaignId: campaign.id,
        agentId: user.id,
        status: { in: OPEN_CONTACT_STATUSES },
        nextAttemptAt: { gt: now, lte: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
      },
      select: CONTACT_SELECT,
      orderBy: { nextAttemptAt: 'desc' },
    });
  }

  private async activeCampaign(id: number): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Kampaniya topilmadi');
    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new ConflictException(`Kampaniya ${CAMPAIGN_STATUS_LABELS[campaign.status].toLowerCase()} holatida — qo'ng'iroq qilinmaydi`);
    }
    return campaign;
  }

  private async ownContact(user: AuthUser, campaignId: number, contactId: number) {
    const contact = await this.prisma.campaignContact.findFirst({ where: { id: contactId, campaignId } });
    if (!contact) throw new NotFoundException('Kontakt topilmadi');
    if (contact.agentId !== user.id) throw new ForbiddenException('Bu kontakt boshqa operatorga biriktirilgan');
    if (!OPEN_CONTACT_STATUSES.includes(contact.status)) throw new ConflictException('Kontakt bo\'yicha natija allaqachon yozilgan');
    return contact;
  }

  /** Kontaktlar: qo'lda ro'yxat va davrda yopilgan murojaatlar fuqarolari; takror raqamlar o'tkazib yuboriladi. */
  private async addContacts(campaignId: number, dto: ContactsSourceDto): Promise<{ added: number; skipped: number }> {
    const rows = new Map<string, Prisma.CampaignContactCreateManyInput>();
    let skipped = 0;
    for (const c of dto.contacts ?? []) {
      const phone = normalizePhone(c.phone);
      if (!isPhone(phone) || rows.has(phone)) {
        skipped++;
        continue;
      }
      rows.set(phone, { campaignId, phone, fullName: c.fullName?.trim() || null });
    }
    if (dto.closedFrom || dto.closedTo) {
      const tickets = await this.prisma.ticket.findMany({
        where: {
          status: TicketStatus.CLOSED,
          closedAt: { gte: dto.closedFrom, lte: dto.closedTo },
          isAnonymous: false,
          isConfidential: false,
          citizenId: { not: null },
          ...(dto.categoryId ? { OR: [{ categoryId: dto.categoryId }, { category: { parentId: dto.categoryId } }] } : {}),
        },
        select: { id: true, citizen: { select: { id: true, phone: true, fullName: true } } },
        orderBy: { closedAt: 'desc' },
        take: TICKET_SOURCE_LIMIT,
      });
      for (const t of tickets) {
        const phone = t.citizen!.phone;
        if (!isPhone(phone) || rows.has(phone)) continue;
        rows.set(phone, { campaignId, phone, fullName: t.citizen!.fullName, citizenId: t.citizen!.id, ticketId: t.id });
      }
    }
    if (rows.size === 0) return { added: 0, skipped };
    // Fuqaro kartasi raqam bo'yicha bog'lanadi
    const citizens = await this.prisma.citizen.findMany({ where: { phone: { in: [...rows.keys()] } }, select: { id: true, phone: true, fullName: true } });
    for (const citizen of citizens) {
      const row = rows.get(citizen.phone)!;
      row.citizenId ??= citizen.id;
      row.fullName ??= citizen.fullName;
    }
    const { count } = await this.prisma.campaignContact.createMany({ data: [...rows.values()], skipDuplicates: true });
    return { added: count, skipped: skipped + rows.size - count };
  }

  private emptyStats() {
    return { total: 0, processed: 0, reached: 0, callable: 0, byStatus: {} as Partial<Record<CampaignContactStatus, number>>, reachPercent: null as number | null };
  }

  private async stats(ids: number[]) {
    const now = new Date();
    const [groups, processed, callable] = await Promise.all([
      this.prisma.campaignContact.groupBy({ by: ['campaignId', 'status'], where: { campaignId: { in: ids } }, _count: { _all: true } }),
      this.prisma.campaignContact.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, attempts: { gt: 0 } }, _count: { _all: true } }),
      this.prisma.campaignContact.groupBy({
        by: ['campaignId'],
        where: { campaignId: { in: ids }, status: { in: OPEN_CONTACT_STATUSES }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        _count: { _all: true },
      }),
    ]);
    const result = new Map<number, ReturnType<CampaignsService['emptyStats']>>();
    for (const id of ids) result.set(id, this.emptyStats());
    for (const g of groups) {
      const s = result.get(g.campaignId)!;
      s.total += g._count._all;
      s.byStatus[g.status] = g._count._all;
    }
    for (const g of processed) result.get(g.campaignId)!.processed = g._count._all;
    for (const g of callable) result.get(g.campaignId)!.callable = g._count._all;
    for (const s of result.values()) {
      s.reached = s.byStatus.REACHED ?? 0;
      s.reachPercent = s.processed > 0 ? Math.round((s.reached / s.processed) * 100) : null;
    }
    return result;
  }
}
