import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Conversation, ConversationStatus, MessageDirection, Prisma, TicketChannel } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuthUser } from '../common/auth-user';
import { hasPermission, ticketScopeWhere } from '../common/data-scope';
import { Page, pageArgs, RequestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import { normalizePhone } from '../common/phone';
import { scheduleState } from '../ivr/ivr-engine';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';
import { findTicketNumber, lookupTicketStatus, ticketStatusPhrase } from '../tickets/ticket-lookup';
import { TicketsService } from '../tickets/tickets.service';
import { EmailChannel, TelegramBot } from '../integrations/channels';
import { ParsedEmail } from './mime';
import { ConversationsQueryDto, ConversationTicketDto, OMNI_CHANNELS, OmniSettingsDto, SimulateInboundDto, WebchatMessageDto } from './omni.dto';
import { parseTelegramUpdate, TelegramApiError, TgUpdate } from './telegram';

/** Kanaldan kelgan xabar (Telegram, veb-chat, email yoki ishlab chiqishdagi taqlid). */
export interface InboundMessage {
  channel: TicketChannel;
  /** Suhbat kaliti: Telegram chat id, veb-chat tokeni, email zanjirining birinchi Message-ID si */
  externalId: string;
  body: string;
  contactName?: string | null;
  contactHandle?: string | null;
  /** Fuqaro o'zi kiritgan raqam (tasdiqlanmagan) */
  contactPhone?: string | null;
  /** Telegram tasdiqlagan raqam: fuqaro kartasiga avtomatik bog'lanadi */
  verifiedPhone?: string | null;
  subject?: string | null;
  messageExternalId?: string | null;
  attachments?: Prisma.InputJsonValue | null;
}

const ACTIVE: ConversationStatus[] = [ConversationStatus.OPEN, ConversationStatus.PENDING];
const OUTBOX_MAX_AGE_MS = 3 * 24 * 3600_000;

const LIST_SELECT = {
  id: true,
  channel: true,
  status: true,
  contactName: true,
  contactHandle: true,
  contactPhone: true,
  subject: true,
  unreadCount: true,
  lastMessageAt: true,
  createdAt: true,
  assignee: { select: { id: true, fullName: true } },
  citizen: { select: { id: true, fullName: true, phone: true } },
  ticket: { select: { id: true, number: true, status: true } },
  messages: { orderBy: [{ sentAt: 'desc' }, { id: 'desc' }], take: 1, select: { body: true, direction: true, sentAt: true, isAuto: true } },
} satisfies Prisma.ConversationSelect;

const MESSAGE_SELECT = {
  id: true,
  direction: true,
  body: true,
  attachments: true,
  status: true,
  error: true,
  isAuto: true,
  sentAt: true,
  author: { select: { id: true, fullName: true } },
} satisfies Prisma.MessageSelect;

type ConversationRow = Conversation;

/**
 * Omnikanal (F-OMNI-01..04): Telegram, veb-chat va email yozishmalari bitta operator oynasida,
 * fuqaro kartasi va murojaatlar bilan bog'langan holda.
 */
@Injectable()
export class OmniService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OmniService.name);
  private timer?: NodeJS.Timeout;
  private flushing = false;
  readonly devSimulation: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly realtime: RealtimeGateway,
    private readonly tickets: TicketsService,
    private readonly telegram: TelegramBot,
    private readonly email: EmailChannel,
    config: ConfigService,
  ) {
    this.devSimulation = config.get<string>('NODE_ENV') !== 'production' && config.get<string>('OMNI_DEV_SIMULATION') !== 'false';
  }

  onModuleInit(): void {
    this.telegram.onUpdate((update) => this.onTelegram(update));
    // Kanal ulanmaganida navbatda qolgan javoblar ulangach yuboriladi
    this.timer = setInterval(() => void this.flushOutbox(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ───────────── Ko'rish doirasi ─────────────

  /** Supervisor (monitoring) hamma suhbatni ko'radi; operator — biriktirilmagan va o'ziniki. */
  private seesAll(user: AuthUser): boolean {
    return hasPermission(user, Permission.MonitoringView);
  }

  private scopeWhere(user: AuthUser): Prisma.ConversationWhereInput {
    return {
      channel: { in: [...OMNI_CHANNELS] },
      ...(this.seesAll(user) ? {} : { OR: [{ assigneeId: null }, { assigneeId: user.id }] }),
    };
  }

  private async visible(user: AuthUser, id: number): Promise<ConversationRow> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conversation || !(OMNI_CHANNELS as readonly TicketChannel[]).includes(conversation.channel)) throw new NotFoundException('Suhbat topilmadi');
    if (!this.seesAll(user) && conversation.assigneeId !== null && conversation.assigneeId !== user.id) {
      throw new ForbiddenException('Bu suhbat boshqa operatorga biriktirilgan');
    }
    return conversation;
  }

  private changed(conversationId: number): void {
    this.realtime.emitToRoom('omni', 'omni.changed', { conversationId });
  }

  // ───────────── Operator oynasi ─────────────

  async list(user: AuthUser, query: ConversationsQueryDto): Promise<Page<unknown>> {
    const and: Prisma.ConversationWhereInput[] = [this.scopeWhere(user)];
    if (query.channel) and.push({ channel: query.channel });
    const status = query.status ?? 'active';
    if (status === 'open') and.push({ status: ConversationStatus.OPEN });
    else if (status === 'pending') and.push({ status: ConversationStatus.PENDING });
    else if (status === 'closed') and.push({ status: ConversationStatus.CLOSED });
    else if (status === 'active') and.push({ status: { in: ACTIVE } });
    if (query.scope === 'mine') and.push({ assigneeId: user.id });
    else if (query.scope === 'unassigned') and.push({ assigneeId: null });
    const search = query.search?.trim();
    if (search) {
      const digits = search.replace(/[^\d+]/g, '');
      and.push({
        OR: [
          { contactName: { contains: search, mode: 'insensitive' } },
          { contactHandle: { contains: search, mode: 'insensitive' } },
          { subject: { contains: search, mode: 'insensitive' } },
          ...(digits.length >= 4 ? [{ contactPhone: { contains: digits } }] : []),
          { ticket: { number: { contains: search } } },
          { messages: { some: { body: { contains: search, mode: 'insensitive' } } } },
        ],
      });
    }
    const where: Prisma.ConversationWhereInput = { AND: and };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({ where, select: LIST_SELECT, orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }], ...pageArgs(query) }),
      this.prisma.conversation.count({ where }),
    ]);
    return {
      items: rows.map(({ messages, ...c }) => ({ ...c, lastMessage: messages[0] ?? null })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async counts(user: AuthUser) {
    const scope = this.scopeWhere(user);
    const mineOrFree: Prisma.ConversationWhereInput = { OR: [{ assigneeId: null }, { assigneeId: user.id }] };
    const [open, unassigned, mine, attention] = await this.prisma.$transaction([
      this.prisma.conversation.count({ where: { AND: [scope, { status: ConversationStatus.OPEN }] } }),
      this.prisma.conversation.count({ where: { AND: [scope, { status: ConversationStatus.OPEN, assigneeId: null }] } }),
      this.prisma.conversation.count({ where: { AND: [scope, { status: { in: ACTIVE }, assigneeId: user.id }] } }),
      this.prisma.conversation.count({ where: { AND: [scope, mineOrFree, { status: ConversationStatus.OPEN, unreadCount: { gt: 0 } }] } }),
    ]);
    return { open, unassigned, mine, attention };
  }

  async get(user: AuthUser, id: number) {
    const base = await this.visible(user, id);
    // O'qildi: biriktirilmagan yoki o'ziniki bo'lsa (supervisor kuzatgani "o'qildi" hisoblanmaydi)
    if (base.unreadCount > 0 && (base.assigneeId === null || base.assigneeId === user.id)) {
      await this.prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
      this.changed(id);
    }
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id },
      select: {
        ...LIST_SELECT,
        externalId: false,
        messages: { orderBy: [{ sentAt: 'asc' }, { id: 'asc' }], take: 500, select: MESSAGE_SELECT },
      },
    });
    // F-OMNI-04: fuqaroning boshqa kanallardagi murojaatlari va yozishmalari
    const citizenId = conversation.citizen?.id;
    const [tickets, conversations, calls] = citizenId
      ? await Promise.all([
          this.prisma.ticket.findMany({
            where: { citizenId, isAnonymous: false, ...(hasPermission(user, Permission.TicketsConfidential) ? {} : { isConfidential: false }) },
            select: { id: true, number: true, status: true, channel: true, subject: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),
          this.prisma.conversation.findMany({
            where: { citizenId, id: { not: id } },
            select: { id: true, channel: true, status: true, lastMessageAt: true, subject: true },
            orderBy: { lastMessageAt: 'desc' },
            take: 10,
          }),
          this.prisma.call.count({ where: { citizenId } }),
        ])
      : [[], [], 0];
    return { ...conversation, unreadCount: 0, history: { tickets, conversations, calls } };
  }

  async reply(user: AuthUser, id: number, body: string) {
    const conversation = await this.visible(user, id);
    const message = await this.deliver(conversation, body.trim(), { authorId: user.id });
    await this.prisma.conversation.update({
      where: { id },
      data: {
        status: ConversationStatus.PENDING,
        closedAt: null,
        unreadCount: 0,
        lastMessageAt: new Date(),
        assigneeId: conversation.assigneeId ?? user.id,
      },
    });
    this.changed(id);
    return message;
  }

  async retry(user: AuthUser, messageId: number) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.direction !== MessageDirection.OUT) throw new NotFoundException('Xabar topilmadi');
    const conversation = await this.visible(user, message.conversationId);
    if (message.status === 'sent') return this.prisma.message.findUniqueOrThrow({ where: { id: messageId }, select: MESSAGE_SELECT });
    const result = await this.send(conversation, message.id, message.body);
    this.changed(conversation.id);
    return result;
  }

  async assign(user: AuthUser, id: number, userId: number | null) {
    const conversation = await this.visible(user, id);
    if (!this.seesAll(user) && userId !== user.id && !(userId === null && conversation.assigneeId === user.id)) {
      throw new ForbiddenException("Suhbatni boshqa operatorga faqat supervisor biriktiradi");
    }
    if (userId !== null) {
      const target = await this.prisma.user.findFirst({
        where: { id: userId, isActive: true, roles: { some: { role: { permissions: { has: Permission.TicketsCreate } } } } },
        select: { id: true },
      });
      if (!target) throw new NotFoundException('Operator topilmadi');
    }
    await this.prisma.conversation.update({ where: { id }, data: { assigneeId: userId } });
    this.changed(id);
    if (userId !== null && userId !== user.id) this.realtime.emitToUser(userId, 'omni.assigned', { conversationId: id });
    return this.get(user, id);
  }

  /** Omnikanal suhbatini olishi mumkin bo'lgan xodimlar (supervisor biriktirishi uchun). */
  operators() {
    return this.prisma.user.findMany({
      where: { isActive: true, roles: { some: { role: { permissions: { has: Permission.TicketsCreate } } } } },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async setStatus(user: AuthUser, id: number, status: ConversationStatus) {
    await this.visible(user, id);
    await this.prisma.conversation.update({
      where: { id },
      data: { status, closedAt: status === ConversationStatus.CLOSED ? new Date() : null, unreadCount: status === ConversationStatus.CLOSED ? 0 : undefined },
    });
    this.changed(id);
    return this.get(user, id);
  }

  async linkCitizen(user: AuthUser, id: number, phoneInput: string) {
    const conversation = await this.visible(user, id);
    const phone = normalizePhone(phoneInput);
    const citizen =
      (await this.prisma.citizen.findUnique({ where: { phone } })) ??
      (await this.prisma.citizen.findFirst({ where: { extraPhones: { has: phone } } })) ??
      (await this.prisma.citizen.create({ data: { phone, fullName: conversation.contactName } }));
    await this.prisma.conversation.update({ where: { id }, data: { citizenId: citizen.id, contactPhone: phone } });
    this.changed(id);
    return this.get(user, id);
  }

  async createTicket(user: AuthUser, id: number, dto: ConversationTicketDto, meta: RequestMeta) {
    const conversation = await this.visible(user, id);
    if (conversation.ticketId) throw new ConflictException("Suhbat allaqachon murojaatga bog'langan");
    const ticket = await this.tickets.create(
      user,
      {
        ...dto,
        channel: conversation.channel,
        citizenPhone: dto.isAnonymous ? undefined : (dto.citizenPhone ?? conversation.contactPhone ?? undefined),
        citizenName: dto.isAnonymous ? undefined : (dto.citizenName ?? conversation.contactName ?? undefined),
      },
      meta,
    );
    const updated = await this.prisma.conversation.update({
      where: { id },
      data: { ticketId: ticket.id, citizenId: conversation.citizenId ?? ticket.citizen?.id ?? null, assigneeId: conversation.assigneeId ?? user.id },
    });
    const omni = await this.settings.get('omni');
    await this.deliver(updated, omni.ticketCreated.replace('{raqam}', ticket.number), { isAuto: true });
    this.changed(id);
    return ticket;
  }

  async linkTicket(user: AuthUser, id: number, number: string) {
    const conversation = await this.visible(user, id);
    const ticket = await this.prisma.ticket.findFirst({
      where: { AND: [ticketScopeWhere(user), { number: { equals: number.trim(), mode: 'insensitive' } }] },
      select: { id: true, citizenId: true },
    });
    if (!ticket) throw new NotFoundException('Murojaat topilmadi yoki uni ko\'rish huquqingiz yo\'q');
    await this.prisma.conversation.update({ where: { id }, data: { ticketId: ticket.id, citizenId: conversation.citizenId ?? ticket.citizenId } });
    this.changed(id);
    return this.get(user, id);
  }

  // ───────────── Kanallar holati va sozlamalar ─────────────

  channels() {
    const email = this.email.state();
    return {
      webchat: { state: 'connected' as const, widgetPath: '/webchat.js', pagePath: '/webchat' },
      telegram: { state: this.telegram.state(), username: this.telegram.username, mode: this.telegram.mode, error: this.telegram.lastError },
      email: { inbound: email.inbound, outbound: email.outbound, address: this.email.address, error: this.email.lastError },
      devSimulation: this.devSimulation,
    };
  }

  getSettings() {
    return this.settings.get('omni');
  }

  saveSettings(user: AuthUser, dto: OmniSettingsDto) {
    return this.settings.set('omni', dto, user.id);
  }

  // ───────────── Kiruvchi xabarlar ─────────────

  async receive(input: InboundMessage): Promise<{ conversationId: number; isNew: boolean }> {
    const now = new Date();
    const key = { channel_externalId: { channel: input.channel, externalId: input.externalId } };
    const existing = await this.prisma.conversation.findUnique({ where: key });
    const citizenId = input.verifiedPhone ? await this.citizenIdByPhone(input.verifiedPhone) : null;
    const contact = {
      contactName: existing?.contactName ?? input.contactName ?? null,
      contactHandle: existing?.contactHandle ?? input.contactHandle ?? null,
      contactPhone: input.verifiedPhone ?? existing?.contactPhone ?? input.contactPhone ?? null,
      subject: existing?.subject ?? input.subject ?? null,
      citizenId: existing?.citizenId ?? citizenId,
    };
    const conversation = await this.prisma.conversation.upsert({
      where: key,
      create: { channel: input.channel, externalId: input.externalId, status: ConversationStatus.OPEN, unreadCount: 1, lastMessageAt: now, ...contact },
      update: { status: ConversationStatus.OPEN, closedAt: null, unreadCount: { increment: 1 }, lastMessageAt: now, ...contact },
    });
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.IN,
        body: input.body,
        externalId: input.messageExternalId ?? null,
        attachments: input.attachments ?? undefined,
        sentAt: now,
      },
    });
    this.changed(conversation.id);
    await this.autoReply(conversation, input.body, !existing || existing.status === ConversationStatus.CLOSED).catch((err) =>
      this.logger.warn(`Avtomatik javob yuborilmadi: ${err instanceof Error ? err.message : String(err)}`),
    );
    return { conversationId: conversation.id, isNew: !existing };
  }

  /** Murojaat raqami yuborilsa — holati; yangi yoki qayta ochilgan suhbatda — salomlashish yoki ish vaqtidan tashqari javob. */
  private async autoReply(conversation: ConversationRow, body: string, greet: boolean): Promise<void> {
    const omni = await this.settings.get('omni');
    if (!omni.autoReply) return;
    if (findTicketNumber(body)) {
      await this.deliver(conversation, ticketStatusPhrase(await lookupTicketStatus(this.prisma, body), body), { isAuto: true });
      return;
    }
    if (greet) {
      const open = await this.isWorkingTime();
      await this.deliver(conversation, open ? omni.greeting : `${omni.greeting}\n\n${omni.afterHours}`, { isAuto: true, keyboard: true });
    }
  }

  private async isWorkingTime(at = new Date()): Promise<boolean> {
    const [hours, holidays] = await Promise.all([this.settings.get('working_hours'), this.prisma.holiday.findMany({ select: { date: true } })]);
    return scheduleState({ ...hours, holidays: holidays.map((h) => h.date.toISOString().slice(0, 10)) }, at) === 'open';
  }

  private async citizenIdByPhone(phone: string): Promise<number | null> {
    const citizen =
      (await this.prisma.citizen.findUnique({ where: { phone }, select: { id: true } })) ??
      (await this.prisma.citizen.findFirst({ where: { extraPhones: { has: phone } }, select: { id: true } }));
    return citizen?.id ?? null;
  }

  async onTelegram(update: TgUpdate): Promise<void> {
    const parsed = parseTelegramUpdate(update);
    const client = this.telegram.client;
    if (!parsed || !client) return;
    const base = { channel: TicketChannel.TELEGRAM, externalId: parsed.chatId, contactName: parsed.contactName, contactHandle: parsed.username, messageExternalId: parsed.messageId };
    switch (parsed.intent.kind) {
      case 'start': {
        const omni = await this.settings.get('omni');
        const open = await this.isWorkingTime();
        await client.sendMessage(parsed.chatId, open ? omni.greeting : `${omni.greeting}\n\n${omni.afterHours}`, true);
        return;
      }
      case 'status_help':
        await client.sendMessage(parsed.chatId, 'Murojaat raqamini yuboring, masalan: 1097-2026-000123');
        return;
      case 'contact': {
        const { phone, verified } = parsed.intent;
        const { conversationId } = await this.receive({
          ...base,
          body: `Telefon raqamini yubordi: ${phone}${verified ? '' : ' (boshqa odamning kontakti)'}`,
          contactPhone: phone,
          verifiedPhone: verified ? phone : null,
        });
        const conversation = await this.prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
        await this.deliver(conversation, "Rahmat! Raqamingiz qabul qilindi. Endi savolingizni yozing.", { isAuto: true });
        return;
      }
      case 'message':
        await this.receive({ ...base, body: parsed.intent.text, attachments: parsed.intent.attachments.length ? parsed.intent.attachments : null });
        return;
    }
  }

  /** Kiruvchi xat: javob zanjiri (In-Reply-To/References) yoki jo'natuvchining ochiq suhbatiga qo'shiladi. */
  async receiveEmail(email: ParsedEmail): Promise<{ conversationId: number } | null> {
    if (!email.from.includes('@')) return null;
    // Pochta serveri xatni qayta yuborsa, ikki marta yozilmaydi
    if (email.messageId && (await this.prisma.message.findFirst({ where: { externalId: email.messageId }, select: { id: true } }))) return null;
    const refs = [email.inReplyTo, ...email.references].filter((r): r is string => !!r);
    const byThread = refs.length
      ? await this.prisma.message.findFirst({
          where: { externalId: { in: refs }, conversation: { channel: TicketChannel.EMAIL } },
          select: { conversation: { select: { externalId: true } } },
          orderBy: { id: 'desc' },
        })
      : null;
    const bySender = byThread
      ? null
      : await this.prisma.conversation.findFirst({
          where: { channel: TicketChannel.EMAIL, contactHandle: email.from, status: { in: ACTIVE } },
          select: { externalId: true },
          orderBy: { lastMessageAt: 'desc' },
        });
    const externalId = byThread?.conversation.externalId ?? bySender?.externalId ?? email.messageId ?? `<${randomBytes(12).toString('hex')}@inbound>`;
    const attachmentsNote = email.attachments.length ? `\n\n[Ilovalar: ${email.attachments.map((a) => a.fileName).join(', ')}]` : '';
    const result = await this.receive({
      channel: TicketChannel.EMAIL,
      externalId,
      contactName: email.fromName,
      contactHandle: email.from,
      subject: email.subject || null,
      body: `${email.text || '(matnsiz xat)'}${attachmentsNote}`.slice(0, 20_000),
      messageExternalId: email.messageId,
      attachments: email.attachments.length ? email.attachments : null,
    });
    return { conversationId: result.conversationId };
  }

  // ───────────── Veb-chat (ochiq) ─────────────

  async webchatPost(dto: WebchatMessageDto): Promise<{ token: string; conversationId: number }> {
    const known = dto.token
      ? await this.prisma.conversation.findUnique({ where: { channel_externalId: { channel: TicketChannel.WEBCHAT, externalId: dto.token } }, select: { id: true } })
      : null;
    // Noma'lum token qabul qilinmaydi: yangi suhbatga server o'zi token beradi
    const token = known ? dto.token! : randomBytes(24).toString('base64url');
    const digits = dto.phone?.replace(/\D/g, '') ?? '';
    const { conversationId } = await this.receive({
      channel: TicketChannel.WEBCHAT,
      externalId: token,
      contactName: dto.name?.trim() || null,
      contactPhone: digits.length >= 9 ? normalizePhone(dto.phone!) : null,
      body: dto.body.trim(),
    });
    return { token, conversationId };
  }

  async webchatPoll(token: string, after = 0) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { channel_externalId: { channel: TicketChannel.WEBCHAT, externalId: token } },
      select: { id: true, status: true, ticket: { select: { number: true } } },
    });
    if (!conversation) throw new NotFoundException('Suhbat topilmadi');
    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id, id: { gt: after } },
      select: { id: true, direction: true, body: true, isAuto: true, sentAt: true },
      orderBy: { id: 'asc' },
      take: 200,
    });
    return {
      status: conversation.status,
      ticketNumber: conversation.ticket?.number ?? null,
      // Xodim ismi fuqaroga ko'rsatilmaydi
      messages: messages.map((m) => ({ ...m, author: m.direction === MessageDirection.OUT ? (m.isAuto ? 'Avtomatik javob' : 'Operator') : null })),
    };
  }

  /** Ishlab chiqish: kanal ulanmasdan kiruvchi xabar (Telegram yoki email) taqlidi. */
  async simulate(dto: SimulateInboundDto): Promise<{ conversationId: number | null }> {
    const slug = dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'fuqaro';
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (dto.channel === TicketChannel.EMAIL) {
      const result = await this.receiveEmail({
        from: `${slug}@mail.test`,
        fromName: dto.name,
        subject: dto.text.split('\n')[0].slice(0, 60),
        text: dto.text,
        messageId: `<${randomBytes(8).toString('hex')}@mail.test>`,
        inReplyTo: null,
        references: [],
        attachments: [],
      });
      return { conversationId: result?.conversationId ?? null };
    }
    if (dto.channel === TicketChannel.WEBCHAT) {
      return { conversationId: (await this.webchatPost({ name: dto.name, phone: dto.phone, body: dto.text })).conversationId };
    }
    // Bir xil ism (yoki raqam) — bitta Telegram chat
    const chatId = `sim-${createKey(phone ?? slug)}`;
    const { conversationId } = await this.receive({
      channel: TicketChannel.TELEGRAM,
      externalId: chatId,
      contactName: dto.name,
      contactHandle: `@${slug.replace(/\./g, '_')}`,
      verifiedPhone: phone,
      body: dto.text,
    });
    return { conversationId };
  }

  // ───────────── Chiquvchi xabarlar ─────────────

  private async deliver(conversation: ConversationRow, body: string, opts: { authorId?: number; isAuto?: boolean; keyboard?: boolean }) {
    const message = await this.prisma.message.create({
      data: { conversationId: conversation.id, direction: MessageDirection.OUT, authorId: opts.authorId ?? null, body, isAuto: opts.isAuto ?? false, status: 'queued' },
    });
    const result = await this.send(conversation, message.id, body, opts.keyboard);
    this.changed(conversation.id);
    return result;
  }

  /** Kanal orqali yuboradi va holatini yozadi: sent | queued (kanal ulanmagan yoki tarmoq xatosi) | failed. */
  private async send(conversation: ConversationRow, messageId: number, body: string, keyboard = false) {
    let data: Prisma.MessageUpdateInput;
    try {
      data = { status: 'sent', error: null, externalId: await this.sendVia(conversation, body, keyboard) };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const permanent = err instanceof TelegramApiError || err instanceof PermanentSendError;
      data = { status: err instanceof ChannelOffError || !permanent ? 'queued' : 'failed', error };
      if (!(err instanceof ChannelOffError)) this.logger.warn(`Xabar yuborilmadi (suhbat ${conversation.id}): ${error}`);
    }
    return this.prisma.message.update({ where: { id: messageId }, data, select: MESSAGE_SELECT });
  }

  private async sendVia(conversation: ConversationRow, body: string, keyboard: boolean): Promise<string | null> {
    switch (conversation.channel) {
      case TicketChannel.WEBCHAT:
        return null; // vidjet o'zi so'rab oladi
      case TicketChannel.TELEGRAM: {
        if (!this.telegram.client) throw new ChannelOffError('Telegram bot ulanmagan (TELEGRAM_BOT_TOKEN) — xabar navbatda');
        const sent = await this.telegram.client.sendMessage(conversation.externalId, body, keyboard);
        return String(sent.message_id);
      }
      case TicketChannel.EMAIL: {
        if (!this.email.smtp) throw new ChannelOffError('Pochta serveri (SMTP) ulanmagan — xabar navbatda');
        if (!conversation.contactHandle?.includes('@')) throw new PermanentSendError("Fuqaroning email manzili yo'q");
        const thread = await this.prisma.message.findMany({
          where: { conversationId: conversation.id, externalId: { startsWith: '<' } },
          select: { externalId: true, direction: true },
          orderBy: { id: 'asc' },
        });
        const lastIn = [...thread].reverse().find((m) => m.direction === MessageDirection.IN)?.externalId ?? undefined;
        const subject = conversation.subject ? (/^re:/i.test(conversation.subject) ? conversation.subject : `Re: ${conversation.subject}`) : "Murojaatingiz bo'yicha javob";
        try {
          return await this.email.send({ to: conversation.contactHandle, subject, text: body, inReplyTo: lastIn, references: thread.map((m) => m.externalId!).slice(-10) });
        } catch (err) {
          // 5xx — doimiy xato (manzil yo'q va h.k.), qolganlari qayta urinib ko'riladi
          if (err instanceof Error && /SMTP \w+: 5\d\d/.test(err.message)) throw new PermanentSendError(err.message);
          throw err;
        }
      }
      default:
        throw new PermanentSendError('Bu kanal orqali javob yuborilmaydi');
    }
  }

  /** Navbatdagi xabarlar: kanal ulangach yoki tarmoq tiklangach yuboriladi. */
  async flushOutbox(): Promise<void> {
    if (this.flushing) return;
    const channels: TicketChannel[] = [];
    if (this.telegram.state() === 'connected') channels.push(TicketChannel.TELEGRAM);
    if (this.email.smtp) channels.push(TicketChannel.EMAIL);
    if (channels.length === 0) return;
    this.flushing = true;
    try {
      const queued = await this.prisma.message.findMany({
        where: { direction: MessageDirection.OUT, status: 'queued', sentAt: { gt: new Date(Date.now() - OUTBOX_MAX_AGE_MS) }, conversation: { channel: { in: channels } } },
        include: { conversation: true },
        orderBy: { id: 'asc' },
        take: 50,
      });
      for (const message of queued) {
        await this.send(message.conversation, message.id, message.body);
        this.changed(message.conversationId);
      }
    } catch (err) {
      this.logger.warn(`Navbatdagi xabarlar yuborilmadi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.flushing = false;
    }
  }
}

/** Kanal sozlanmagan: xabar navbatda qoladi. */
class ChannelOffError extends Error {}
/** Qayta urinish foyda bermaydi: xabar "yuborilmadi" bo'ladi. */
class PermanentSendError extends Error {}

function createKey(value: string): string {
  let hash = 0;
  for (const ch of value) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}
