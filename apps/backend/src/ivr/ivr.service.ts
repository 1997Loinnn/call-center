import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IvrAction, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import type { Readable } from 'node:stream';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { diffFields, FieldChanges } from '../common/diff';
import { Permission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { LocalRecordingStorage } from '../recordings/recording-storage';
import { SettingsService } from '../settings/settings.service';
import { BlacklistService } from '../telephony/blacklist';
import { PBX_ADAPTER, PbxAdapter, PbxConfig } from '../telephony/pbx-adapter';
import { lookupTicketStatus, ticketStatusPhrase } from '../tickets/ticket-lookup';
import { ACTION_TARGET, IVR_DIGITS, IvrFlow, simulate, validateFlow } from './ivr-engine';
import { IvrSettingsDto, MembersDto, MenuDto, OptionsDto, PromptDto, QueueDto, SimulateDto } from './ivr.dto';

export const VOICE_PROMPT_STORAGE = Symbol('VOICE_PROMPT_STORAGE');

/** Yuklanadigan ovozli xabar fayli (multer xotira rejimi). */
export interface UploadedAudio {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** UCM6510 qabul qiladigan formatlar; boshqa formatni diktor yozuvini shu formatga o'tkazib yuklash kerak. */
const AUDIO_TYPES: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.gsm': 'audio/gsm',
  '.ulaw': 'audio/basic',
  '.alaw': 'audio/basic',
};
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const ACTION_LABELS: Record<IvrAction, string> = {
  SUBMENU: 'Menyuga',
  QUEUE: 'Navbatga',
  TICKET_STATUS: 'Murojaat holati',
  CALLBACK: "Qayta qo'ng'iroq",
  VOICEMAIL: 'Ovozli xabar',
  PLAYBACK: 'Xabar eshittirish',
  REPEAT: 'Qayta eshittirish',
  HANGUP: 'Uzish',
};

const MENU_INCLUDE = { options: true } satisfies Prisma.IvrMenuInclude;
const QUEUE_INCLUDE = {
  members: {
    include: { user: { select: { id: true, fullName: true, sipExtension: true, isActive: true, languages: true } } },
    orderBy: [{ penalty: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.QueueInclude;

type MenuRow = Prisma.IvrMenuGetPayload<{ include: typeof MENU_INCLUDE }>;
type QueueRow = Prisma.QueueGetPayload<{ include: typeof QUEUE_INCLUDE }>;

const digitOrder = (digit: string) => IVR_DIGITS.indexOf(digit as (typeof IVR_DIGITS)[number]);
const sortOptions = <T extends { digit: string }>(options: T[]) => [...options].sort((a, b) => digitOrder(a.digit) - digitOrder(b.digit));
const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const activeMembers = (queue: QueueRow) => queue.members.filter((m) => m.user.isActive && m.user.sipExtension);

/** Navbatlar va IVR (F-TEL-02..06, F-ADM-03): tahrirlash, tekshirish, simulyatsiya va PBX'ga yuklash. */
@Injectable()
export class IvrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(PBX_ADAPTER) private readonly pbx: PbxAdapter,
    @Inject(VOICE_PROMPT_STORAGE) private readonly storage: LocalRecordingStorage,
    private readonly blacklist: BlacklistService,
  ) {}

  // ───────────── Umumiy ko'rinish ─────────────

  private async load() {
    const [menus, prompts, queues, ivr, workingHours, holidays, blacklist] = await Promise.all([
      this.prisma.ivrMenu.findMany({ include: MENU_INCLUDE, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      this.prisma.voicePrompt.findMany({ orderBy: [{ language: 'asc' }, { name: 'asc' }] }),
      this.prisma.queue.findMany({ include: QUEUE_INCLUDE, orderBy: { pbxNumber: 'asc' } }),
      this.settings.get('ivr'),
      this.settings.get('working_hours'),
      this.prisma.holiday.findMany({ select: { date: true } }),
      this.blacklist.activeNumbers(),
    ]);
    const flow: IvrFlow = {
      entryMenuId: ivr.entryMenuId,
      afterHours: { promptId: ivr.afterHoursPromptId, voicemail: ivr.voicemailAfterHours },
      holidayPromptId: ivr.holidayPromptId,
      schedule: { days: workingHours.days, start: workingHours.start, end: workingHours.end, holidays: holidays.map((h) => dateKey(h.date)) },
      prompts: prompts.map((p) => ({ id: p.id, name: p.name, text: p.text, hasAudio: !!p.storageKey })),
      queues: queues.map((q) => ({
        id: q.id,
        number: q.pbxNumber,
        name: q.name,
        isActive: q.isActive,
        members: activeMembers(q).length,
        maxWaitSeconds: q.maxWaitSeconds,
        callbackEnabled: q.callbackEnabled,
        announcePosition: q.announcePosition,
      })),
      menus: menus.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        promptId: m.promptId,
        timeoutSeconds: m.timeoutSeconds,
        maxRetries: m.maxRetries,
        fallbackQueueId: m.fallbackQueueId,
        options: sortOptions(m.options).map((o) => ({
          digit: o.digit,
          label: o.label,
          action: o.action,
          queueId: o.queueId,
          targetMenuId: o.targetMenuId,
          promptId: o.promptId,
        })),
      })),
    };
    return { menus, prompts, queues, ivr, workingHours, flow, blacklist };
  }

  /** PBX'ga yuklanadigan konfiguratsiya: kod va raqamlar bilan (bazadagi id'larsiz). */
  private buildConfig(data: Awaited<ReturnType<IvrService['load']>>, version: number): PbxConfig {
    const menuCode = new Map(data.menus.map((m) => [m.id, m.code]));
    const queueNumber = new Map(data.queues.map((q) => [q.id, q.pbxNumber]));
    const promptFile = new Map(data.prompts.map((p) => [p.id, p.storageKey]));
    const file = (id: number | null) => (id === null ? null : (promptFile.get(id) ?? null));
    return {
      version,
      blacklist: data.blacklist,
      queues: data.queues.map((q) => ({
        number: q.pbxNumber,
        name: q.name,
        language: q.language,
        isActive: q.isActive,
        strategy: q.strategy,
        maxWaitSeconds: q.maxWaitSeconds,
        callbackEnabled: q.callbackEnabled,
        announcePosition: q.announcePosition,
        announceEverySeconds: q.announceEverySeconds,
        musicOnHold: q.musicOnHold,
        wrapUpSeconds: q.wrapUpSeconds,
        members: activeMembers(q).map((m) => ({ extension: m.user.sipExtension!, penalty: m.penalty })),
      })),
      ivr: {
        entry: data.ivr.entryMenuId === null ? null : (menuCode.get(data.ivr.entryMenuId) ?? null),
        menus: data.flow.menus.map((m) => ({
          code: m.code,
          name: m.name,
          prompt: file(m.promptId),
          timeoutSeconds: m.timeoutSeconds,
          maxRetries: m.maxRetries,
          fallbackQueue: m.fallbackQueueId === null ? null : (queueNumber.get(m.fallbackQueueId) ?? null),
          options: m.options.map((o) => ({
            digit: o.digit,
            action: o.action,
            ...(o.queueId !== null ? { queue: queueNumber.get(o.queueId) } : {}),
            ...(o.targetMenuId !== null ? { menu: menuCode.get(o.targetMenuId) } : {}),
            ...(o.promptId !== null ? { prompt: file(o.promptId) ?? undefined } : {}),
          })),
        })),
      },
      schedule: {
        days: data.workingHours.days,
        start: data.workingHours.start,
        end: data.workingHours.end,
        holidays: [...data.flow.schedule.holidays].sort(),
        afterHoursPrompt: file(data.ivr.afterHoursPromptId),
        holidayPrompt: file(data.ivr.holidayPromptId),
        voicemail: data.ivr.voicemailAfterHours,
      },
    };
  }

  private checksum(config: PbxConfig): string {
    const { version: _version, ...rest } = config;
    return createHash('sha1').update(JSON.stringify(rest)).digest('hex');
  }

  async overview() {
    const data = await this.load();
    const published = await this.settings.get('ivr_published');
    const usage = this.promptUsage(data);
    return {
      driver: this.pbx.name,
      settings: data.ivr,
      schedule: data.flow.schedule,
      menus: data.menus.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        language: m.language,
        promptId: m.promptId,
        timeoutSeconds: m.timeoutSeconds,
        maxRetries: m.maxRetries,
        fallbackQueueId: m.fallbackQueueId,
        options: sortOptions(m.options),
      })),
      prompts: data.prompts.map((p) => ({
        id: p.id,
        name: p.name,
        language: p.language,
        text: p.text,
        fileName: p.fileName,
        sizeBytes: p.sizeBytes,
        hasAudio: !!p.storageKey,
        updatedAt: p.updatedAt,
        usedIn: usage.get(p.id) ?? [],
      })),
      queues: data.flow.queues,
      issues: validateFlow(data.flow),
      publish: { ...published, dirty: published.checksum !== this.checksum(this.buildConfig(data, published.version)) },
    };
  }

  /** Ovozli xabar qayerlarda ishlatilmoqda (o'chirishdan oldin ko'rsatish uchun). */
  private promptUsage(data: Awaited<ReturnType<IvrService['load']>>): Map<number, string[]> {
    const usage = new Map<number, string[]>();
    const add = (id: number | null, where: string) => {
      if (id !== null) usage.set(id, [...(usage.get(id) ?? []), where]);
    };
    for (const menu of data.menus) {
      add(menu.promptId, menu.name);
      for (const option of menu.options) add(option.promptId, `${menu.name} → «${option.digit}»`);
    }
    add(data.ivr.afterHoursPromptId, 'Ish vaqtidan tashqari');
    add(data.ivr.holidayPromptId, 'Bayram kunlari');
    return usage;
  }

  // ───────────── Simulyator va PBX'ga yuklash ─────────────

  async simulate(dto: SimulateDto) {
    const { flow } = await this.load();
    const result = simulate(flow, dto.input, dto.at ?? new Date());
    if (result.state.type === 'end' && result.state.outcome === 'queue' && result.state.queueId) {
      const number = flow.queues.find((q) => q.id === (result.state as { queueId: number }).queueId)?.number;
      const snapshot = await this.pbx.queueSnapshot().catch(() => null);
      const waiting = snapshot?.find((s) => s.queue === number)?.callers.length;
      if (waiting !== undefined) result.steps.push({ kind: 'info', text: `Hozir bu navbatda ${waiting} kishi kutmoqda` });
    }
    return result;
  }

  /** Simulyatorda "Murojaat holati" tanlanganda: fuqaro tergan raqam bo'yicha aytiladigan matn. */
  async ticketStatus(number: string) {
    const status = await lookupTicketStatus(this.prisma, number);
    return { found: !!status, text: ticketStatusPhrase(status, number) };
  }

  async publish(user: AuthUser) {
    const data = await this.load();
    const errors = validateFlow(data.flow).filter((i) => i.level === 'error');
    if (errors.length > 0) {
      throw new BadRequestException(`IVR'da xatolar bor, avval tuzating: ${errors.map((e) => e.message).join('; ')}`);
    }
    const previous = await this.settings.get('ivr_published');
    const version = previous.version + 1;
    const config = this.buildConfig(data, version);
    const result = await this.pbx
      .applyConfig(config)
      .catch((err: unknown) => ({ applied: false, note: `PBX xatosi: ${err instanceof Error ? err.message : String(err)}` }));
    const published = await this.settings.set(
      'ivr_published',
      {
        version,
        publishedAt: new Date().toISOString(),
        publishedById: user.id,
        publishedBy: user.fullName,
        checksum: this.checksum(config),
        applied: result.applied,
        note: result.note,
      },
      user.id,
    );
    await this.audit.log({
      actorId: user.id,
      action: 'ivr.publish',
      entityType: 'Setting',
      entityId: 'ivr',
      details: { name: `IVR va navbatlar · v${version}`, applied: result.applied, note: result.note, queues: config.queues.length, menus: config.ivr.menus.length },
    });
    return { ...published, dirty: false };
  }

  // ───────────── Umumiy IVR sozlamalari ─────────────

  async saveSettings(user: AuthUser, dto: IvrSettingsDto) {
    if (dto.entryMenuId !== null) await this.menuOrThrow(dto.entryMenuId);
    await this.promptsExist([dto.afterHoursPromptId, dto.holidayPromptId]);
    const before = await this.settings.get('ivr');
    const saved = await this.settings.set('ivr', dto, user.id);
    const names = await this.names();
    const show = (s: typeof before) => ({
      entryMenuId: s.entryMenuId === null ? null : names.menu(s.entryMenuId),
      afterHoursPromptId: names.prompt(s.afterHoursPromptId),
      holidayPromptId: names.prompt(s.holidayPromptId),
      voicemailAfterHours: s.voicemailAfterHours,
    });
    await this.logChanges(user, 'ivr.settings', 'ivr', 'IVR umumiy sozlamalari', diffFields(show(before), show(saved), ['entryMenuId', 'afterHoursPromptId', 'holidayPromptId', 'voicemailAfterHours']));
    return saved;
  }

  // ───────────── Menyular ─────────────

  async createMenu(user: AuthUser, dto: MenuDto) {
    await this.assertMenuRefs(dto);
    if (await this.prisma.ivrMenu.findUnique({ where: { code: dto.code } })) throw new ConflictException(`«${dto.code}» kodli menyu bor`);
    const count = await this.prisma.ivrMenu.count();
    const menu = await this.prisma.ivrMenu.create({
      data: {
        code: dto.code,
        name: dto.name.trim(),
        language: dto.language ?? null,
        promptId: dto.promptId ?? null,
        timeoutSeconds: dto.timeoutSeconds,
        maxRetries: dto.maxRetries,
        fallbackQueueId: dto.fallbackQueueId ?? null,
        sortOrder: count,
      },
      include: MENU_INCLUDE,
    });
    // Birinchi menyu avtomatik boshlang'ich bo'ladi
    const ivr = await this.settings.get('ivr');
    if (ivr.entryMenuId === null) await this.settings.set('ivr', { ...ivr, entryMenuId: menu.id }, user.id);
    await this.audit.log({ actorId: user.id, action: 'ivr.menu.create', entityType: 'IvrMenu', entityId: menu.id, details: { name: menu.name, code: menu.code } });
    return menu;
  }

  async updateMenu(user: AuthUser, id: number, dto: MenuDto) {
    const before = await this.menuOrThrow(id);
    await this.assertMenuRefs(dto);
    const clash = await this.prisma.ivrMenu.findUnique({ where: { code: dto.code } });
    if (clash && clash.id !== id) throw new ConflictException(`«${dto.code}» kodli menyu bor`);
    const menu = await this.prisma.ivrMenu.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name.trim(),
        language: dto.language ?? null,
        promptId: dto.promptId ?? null,
        timeoutSeconds: dto.timeoutSeconds,
        maxRetries: dto.maxRetries,
        fallbackQueueId: dto.fallbackQueueId ?? null,
      },
      include: MENU_INCLUDE,
    });
    const names = await this.names();
    const show = (m: MenuRow) => ({
      code: m.code,
      name: m.name,
      language: m.language,
      promptId: names.prompt(m.promptId),
      timeoutSeconds: m.timeoutSeconds,
      maxRetries: m.maxRetries,
      fallbackQueueId: names.queue(m.fallbackQueueId),
    });
    await this.logChanges(
      user,
      'ivr.menu.update',
      id,
      menu.name,
      diffFields(show(before), show(menu), ['code', 'name', 'language', 'promptId', 'timeoutSeconds', 'maxRetries', 'fallbackQueueId']),
      'IvrMenu',
    );
    return menu;
  }

  async deleteMenu(user: AuthUser, id: number): Promise<void> {
    const menu = await this.menuOrThrow(id);
    const ivr = await this.settings.get('ivr');
    if (ivr.entryMenuId === id) throw new ConflictException("Boshlang'ich menyuni o'chirib bo'lmaydi: avval boshqa menyuni boshlang'ich qiling");
    const incoming = await this.prisma.ivrOption.findMany({ where: { targetMenuId: id }, include: { menu: { select: { name: true } } } });
    if (incoming.length > 0) {
      throw new ConflictException(`Bu menyuga o'tish bor: ${incoming.map((o) => `${o.menu.name} → «${o.digit}»`).join(', ')}. Avval shu tugmalarni o'zgartiring`);
    }
    await this.prisma.ivrMenu.delete({ where: { id } });
    await this.audit.log({ actorId: user.id, action: 'ivr.menu.delete', entityType: 'IvrMenu', entityId: id, details: { name: menu.name, code: menu.code } });
  }

  /** Menyu tugmalarini to'liq almashtiradi (jadvalda tahrirlab "Saqlash"). */
  async setOptions(user: AuthUser, menuId: number, dto: OptionsDto) {
    const menu = await this.menuOrThrow(menuId);
    const digits = dto.options.map((o) => o.digit);
    const duplicate = digits.find((d, i) => digits.indexOf(d) !== i);
    if (duplicate) throw new BadRequestException(`«${duplicate}» tugmasi ikki marta berilgan`);

    const options = dto.options.map((o) => {
      const target = ACTION_TARGET[o.action];
      return {
        menuId,
        digit: o.digit,
        label: o.label.trim(),
        action: o.action,
        queueId: target === 'queue' ? (o.queueId ?? null) : null,
        targetMenuId: target === 'menu' ? (o.targetMenuId ?? null) : null,
        promptId: target === 'prompt' ? (o.promptId ?? null) : null,
      };
    });
    for (const o of options) {
      if (o.targetMenuId === menuId) throw new BadRequestException(`«${o.digit}»: menyu o'ziga o'ta olmaydi — «Qayta eshittirish» amalini tanlang`);
    }
    await this.assertExist('ivrMenu', options.map((o) => o.targetMenuId), "O'tiladigan menyu topilmadi");
    await this.assertExist('queue', options.map((o) => o.queueId), 'Navbat topilmadi');
    await this.promptsExist(options.map((o) => o.promptId));

    await this.prisma.$transaction([
      this.prisma.ivrOption.deleteMany({ where: { menuId } }),
      this.prisma.ivrOption.createMany({ data: options }),
    ]);

    const names = await this.names();
    const describe = (o: { label: string; action: IvrAction; queueId: number | null; targetMenuId: number | null; promptId: number | null }) => {
      const target = o.queueId !== null ? names.queue(o.queueId) : o.targetMenuId !== null ? names.menu(o.targetMenuId) : o.promptId !== null ? names.prompt(o.promptId) : null;
      return `${o.label} — ${ACTION_LABELS[o.action]}${target ? `: ${target}` : ''}`;
    };
    const before = new Map(menu.options.map((o) => [o.digit, describe(o)]));
    const after = new Map(options.map((o) => [o.digit, describe(o)]));
    const changes: FieldChanges = {};
    for (const digit of IVR_DIGITS) {
      const from = before.get(digit) ?? null;
      const to = after.get(digit) ?? null;
      if (from !== to) changes[`«${digit}»`] = { from, to };
    }
    await this.logChanges(user, 'ivr.menu.update', menuId, menu.name, changes, 'IvrMenu');
    return this.menuOrThrow(menuId);
  }

  // ───────────── Ovozli xabarlar ─────────────

  async createPrompt(user: AuthUser, dto: PromptDto) {
    const prompt = await this.prisma.voicePrompt.create({ data: { name: dto.name.trim(), language: dto.language, text: dto.text.trim(), updatedById: user.id } });
    await this.audit.log({ actorId: user.id, action: 'ivr.prompt.create', entityType: 'VoicePrompt', entityId: prompt.id, details: { name: prompt.name } });
    return prompt;
  }

  async updatePrompt(user: AuthUser, id: number, dto: PromptDto) {
    const before = await this.promptOrThrow(id);
    const prompt = await this.prisma.voicePrompt.update({ where: { id }, data: { name: dto.name.trim(), language: dto.language, text: dto.text.trim(), updatedById: user.id } });
    await this.logChanges(user, 'ivr.prompt.update', id, prompt.name, diffFields(before, prompt, ['name', 'language', 'text']), 'VoicePrompt');
    return prompt;
  }

  async deletePrompt(user: AuthUser, id: number): Promise<void> {
    const prompt = await this.promptOrThrow(id);
    const usedIn = this.promptUsage(await this.load()).get(id);
    if (usedIn?.length) throw new ConflictException(`Xabar ishlatilmoqda: ${usedIn.join(', ')}`);
    await this.prisma.voicePrompt.delete({ where: { id } });
    if (prompt.storageKey) await this.storage.remove(prompt.storageKey).catch(() => undefined);
    await this.audit.log({ actorId: user.id, action: 'ivr.prompt.delete', entityType: 'VoicePrompt', entityId: id, details: { name: prompt.name } });
  }

  async uploadAudio(user: AuthUser, id: number, file: UploadedAudio | undefined) {
    const prompt = await this.promptOrThrow(id);
    if (!file || file.size === 0) throw new BadRequestException('Audio fayl tanlanmagan');
    if (file.size > MAX_AUDIO_BYTES) throw new BadRequestException('Fayl 10 MB dan katta');
    // multer fayl nomini latin1 deb o'qiydi: kirill va o'zbek harflari buzilmasligi uchun UTF-8 ga qaytaramiz
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 200);
    const ext = extname(fileName).toLowerCase();
    if (!AUDIO_TYPES[ext]) throw new BadRequestException(`Format qo'llanmaydi: ${Object.keys(AUDIO_TYPES).join(', ')}`);

    const storageKey = `prompt-${id}-${Date.now()}${ext}`;
    await this.storage.write(storageKey, file.buffer);
    const updated = await this.prisma.voicePrompt.update({
      where: { id },
      data: { storageKey, fileName, mimeType: AUDIO_TYPES[ext], sizeBytes: file.size, updatedById: user.id },
    });
    if (prompt.storageKey) await this.storage.remove(prompt.storageKey).catch(() => undefined);
    await this.audit.log({
      actorId: user.id,
      action: 'ivr.prompt.update',
      entityType: 'VoicePrompt',
      entityId: id,
      details: { name: prompt.name, changes: { audio: { from: prompt.fileName, to: fileName } } },
    });
    return updated;
  }

  async removeAudio(user: AuthUser, id: number) {
    const prompt = await this.promptOrThrow(id);
    if (!prompt.storageKey) return prompt;
    const updated = await this.prisma.voicePrompt.update({ where: { id }, data: { storageKey: null, fileName: null, mimeType: null, sizeBytes: null, updatedById: user.id } });
    await this.storage.remove(prompt.storageKey).catch(() => undefined);
    await this.audit.log({ actorId: user.id, action: 'ivr.prompt.update', entityType: 'VoicePrompt', entityId: id, details: { name: prompt.name, changes: { audio: { from: prompt.fileName, to: null } } } });
    return updated;
  }

  async openAudio(id: number): Promise<{ stream: Readable; size: number; mimeType: string; fileName: string }> {
    const prompt = await this.promptOrThrow(id);
    const size = prompt.storageKey ? await this.storage.size(prompt.storageKey) : null;
    if (!prompt.storageKey || size === null) throw new NotFoundException('Bu xabarning audiosi yuklanmagan');
    return { stream: this.storage.read(prompt.storageKey), size, mimeType: prompt.mimeType ?? 'application/octet-stream', fileName: prompt.fileName ?? prompt.storageKey };
  }

  // ───────────── Navbatlar ─────────────

  async queues() {
    const [queues, snapshot, usage] = await Promise.all([
      this.prisma.queue.findMany({ include: QUEUE_INCLUDE, orderBy: { pbxNumber: 'asc' } }),
      this.pbx.queueSnapshot().catch(() => null),
      this.prisma.ivrOption.findMany({ where: { action: IvrAction.QUEUE }, select: { queueId: true, digit: true, menu: { select: { name: true } } } }),
    ]);
    const live = new Map((snapshot ?? []).map((s) => [s.queue, s.callers]));
    return queues.map((q) => {
      const callers = live.get(q.pbxNumber) ?? [];
      return {
        ...q,
        members: q.members.map((m) => ({ userId: m.userId, penalty: m.penalty, fullName: m.user.fullName, sipExtension: m.user.sipExtension, isActive: m.user.isActive, languages: m.user.languages })),
        ivr: usage.filter((u) => u.queueId === q.id).map((u) => `${u.menu.name} → «${u.digit}»`),
        live: snapshot === null ? null : { waiting: callers.length, longestWait: callers.reduce((max, c) => Math.max(max, c.waitSeconds), 0) },
      };
    });
  }

  /** Navbatga biriktirish mumkin bo'lgan xodimlar: telefoniya huquqi bor faol foydalanuvchilar. */
  agents() {
    return this.prisma.user.findMany({
      where: { isActive: true, roles: { some: { role: { permissions: { has: Permission.TelephonyUse } } } } },
      select: { id: true, fullName: true, sipExtension: true, languages: true, orgUnit: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    });
  }

  async createQueue(user: AuthUser, dto: QueueDto) {
    if (await this.prisma.queue.findUnique({ where: { pbxNumber: dto.pbxNumber } })) throw new ConflictException(`${dto.pbxNumber} raqamli navbat bor`);
    const queue = await this.prisma.queue.create({ data: this.queueData(dto) });
    await this.audit.log({ actorId: user.id, action: 'ivr.queue.create', entityType: 'Queue', entityId: queue.id, details: { name: `${queue.pbxNumber} · ${queue.name}` } });
    return queue;
  }

  async updateQueue(user: AuthUser, id: number, dto: QueueDto) {
    const before = await this.prisma.queue.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Navbat topilmadi');
    const clash = await this.prisma.queue.findUnique({ where: { pbxNumber: dto.pbxNumber } });
    if (clash && clash.id !== id) throw new ConflictException(`${dto.pbxNumber} raqamli navbat bor`);
    const queue = await this.prisma.queue.update({ where: { id }, data: this.queueData(dto) });
    await this.logChanges(
      user,
      'ivr.queue.update',
      id,
      `${queue.pbxNumber} · ${queue.name}`,
      diffFields(before, queue, [
        'pbxNumber',
        'name',
        'description',
        'language',
        'isActive',
        'strategy',
        'maxWaitSeconds',
        'callbackEnabled',
        'announcePosition',
        'announceEverySeconds',
        'musicOnHold',
        'wrapUpSeconds',
        'isRestricted',
      ]),
      'Queue',
    );
    return queue;
  }

  async setMembers(user: AuthUser, id: number, dto: MembersDto) {
    const queue = await this.prisma.queue.findUnique({ where: { id }, include: QUEUE_INCLUDE });
    if (!queue) throw new NotFoundException('Navbat topilmadi');
    const ids = dto.members.map((m) => m.userId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Xodim ikki marta berilgan');
    const allowed = new Map((await this.agents()).map((a) => [a.id, a]));
    const unknown = ids.filter((uid) => !allowed.has(uid));
    if (unknown.length > 0) throw new BadRequestException("Navbatga faqat telefoniya huquqi bor faol xodimlar biriktiriladi");

    await this.prisma.$transaction([
      this.prisma.queueMember.deleteMany({ where: { queueId: id } }),
      this.prisma.queueMember.createMany({ data: dto.members.map((m) => ({ queueId: id, userId: m.userId, penalty: m.penalty })) }),
    ]);

    const before = new Map(queue.members.map((m) => [m.userId, m]));
    const added = dto.members.filter((m) => !before.has(m.userId)).map((m) => allowed.get(m.userId)!.fullName);
    const removed = queue.members.filter((m) => !ids.includes(m.userId)).map((m) => m.user.fullName);
    const changed = dto.members.filter((m) => before.has(m.userId) && before.get(m.userId)!.penalty !== m.penalty).map((m) => allowed.get(m.userId)!.fullName);
    const changes: FieldChanges = {};
    if (added.length || removed.length) changes.members = { from: removed.length ? removed : null, to: added.length ? added : null };
    if (changed.length) changes.penalty = { from: null, to: changed };
    await this.logChanges(user, 'ivr.queue.update', id, `${queue.pbxNumber} · ${queue.name}`, changes, 'Queue');
    return (await this.queues()).find((q) => q.id === id);
  }

  // ───────────── Yordamchi ─────────────

  private queueData(dto: QueueDto) {
    return {
      pbxNumber: dto.pbxNumber,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      language: dto.language ?? null,
      isActive: dto.isActive,
      strategy: dto.strategy,
      maxWaitSeconds: dto.maxWaitSeconds,
      callbackEnabled: dto.callbackEnabled,
      announcePosition: dto.announcePosition,
      announceEverySeconds: dto.announceEverySeconds,
      musicOnHold: dto.musicOnHold,
      wrapUpSeconds: dto.wrapUpSeconds,
      isRestricted: dto.isRestricted,
    };
  }

  private async menuOrThrow(id: number): Promise<MenuRow> {
    const menu = await this.prisma.ivrMenu.findUnique({ where: { id }, include: MENU_INCLUDE });
    if (!menu) throw new NotFoundException('Menyu topilmadi');
    return { ...menu, options: sortOptions(menu.options) };
  }

  private async promptOrThrow(id: number) {
    const prompt = await this.prisma.voicePrompt.findUnique({ where: { id } });
    if (!prompt) throw new NotFoundException('Ovozli xabar topilmadi');
    return prompt;
  }

  private async assertMenuRefs(dto: MenuDto): Promise<void> {
    await this.promptsExist([dto.promptId ?? null]);
    await this.assertExist('queue', [dto.fallbackQueueId ?? null], 'Zaxira navbat topilmadi');
  }

  private promptsExist(ids: (number | null | undefined)[]): Promise<void> {
    return this.assertExist('voicePrompt', ids, 'Ovozli xabar topilmadi');
  }

  private async assertExist(model: 'ivrMenu' | 'queue' | 'voicePrompt', ids: (number | null | undefined)[], message: string): Promise<void> {
    const wanted = [...new Set(ids.filter((id): id is number => typeof id === 'number'))];
    if (wanted.length === 0) return;
    const where = { id: { in: wanted } };
    const found =
      model === 'ivrMenu'
        ? await this.prisma.ivrMenu.count({ where })
        : model === 'queue'
          ? await this.prisma.queue.count({ where })
          : await this.prisma.voicePrompt.count({ where });
    if (found !== wanted.length) throw new BadRequestException(message);
  }

  /** Audit jurnali uchun id → nom. */
  private async names() {
    const [menus, queues, prompts] = await Promise.all([
      this.prisma.ivrMenu.findMany({ select: { id: true, name: true } }),
      this.prisma.queue.findMany({ select: { id: true, pbxNumber: true, name: true } }),
      this.prisma.voicePrompt.findMany({ select: { id: true, name: true } }),
    ]);
    const m = new Map(menus.map((x) => [x.id, x.name]));
    const q = new Map(queues.map((x) => [x.id, `${x.pbxNumber} · ${x.name}`]));
    const p = new Map(prompts.map((x) => [x.id, x.name]));
    return {
      menu: (id: number | null) => (id === null ? null : (m.get(id) ?? `#${id}`)),
      queue: (id: number | null) => (id === null ? null : (q.get(id) ?? `#${id}`)),
      prompt: (id: number | null) => (id === null ? null : (p.get(id) ?? `#${id}`)),
    };
  }

  private async logChanges(user: AuthUser, action: string, entityId: number | string, name: string, changes: FieldChanges, entityType = 'Setting'): Promise<void> {
    if (Object.keys(changes).length === 0) return;
    await this.audit.log({ actorId: user.id, action, entityType, entityId, details: { name, changes } as unknown as Prisma.InputJsonValue });
  }
}
