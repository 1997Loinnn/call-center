import { Body, Controller, Get, Global, Injectable, Logger, Module, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CallDirection, CallResult } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { Permission } from '../common/permissions';
import { NotificationsService } from '../integrations/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { staffing, weightedForecast } from './forecast';
import { KeywordHit, scanKeywords } from './keywords';
import { ClassifierModel, findPlace, normalizeText, predict, train, TrainingDoc } from './text-classifier';

export class SuggestDto {
  @IsString()
  @MaxLength(5000)
  text: string;
}

export class ForecastQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Sana YYYY-MM-DD ko\'rinishida' })
  date?: string;
}

export class KeywordGroupDto {
  @IsString()
  @Matches(/^[a-z_]{2,32}$/)
  key: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  words: string[];

  @IsIn(['confidential', 'supervisors', 'none'])
  notify: 'confidential' | 'supervisors' | 'none';
}

export class AiSettingsDto {
  @IsBoolean()
  suggestions: boolean;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => KeywordGroupDto)
  keywordGroups: KeywordGroupDto[];

  @IsNumber()
  @Min(0)
  @Max(0.9)
  shrinkage: number;
}

/** Model qayta o'qitilish oralig'i: yangi murojaatlar va mavzular hisobga olinadi */
const RETRAIN_MS = 6 * 3600_000;
const TRAIN_LIMIT = 20_000;
const HISTORY_WEEKS = 8;
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Mahalliy sun'iy intellekt (F-AI-02/04/06): tashqi xizmatlarsiz, server ichida.
 *  - murojaat matnidan mavzu va hududni taklif qilish (o'tgan murojaatlarda o'qitilgan Naive Bayes);
 *  - kalit so'zlar bo'yicha belgi va mas'ullarga xabar;
 *  - soatlik qo'ng'iroqlar prognozi va Erlang C bo'yicha kerakli operatorlar soni.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private model: { at: number; model: ClassifierModel } | null = null;
  private training: Promise<ClassifierModel> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Mavzu tavsiyasi ─────────────

  private async classifier(): Promise<ClassifierModel> {
    if (this.model && Date.now() - this.model.at < RETRAIN_MS) return this.model.model;
    if (!this.training) {
      this.training = this.trainModel()
        .then((model) => {
          this.model = { at: Date.now(), model };
          return model;
        })
        .finally(() => (this.training = null));
    }
    // Eski model bo'lsa — qayta o'qitish tugashini kutmasdan shu bilan javob beriladi
    return this.model?.model ?? this.training;
  }

  private async trainModel(): Promise<ClassifierModel> {
    const started = Date.now();
    const [tickets, topics, articles] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { categoryId: { not: null }, category: { parentId: { not: null }, isActive: true } },
        select: { categoryId: true, description: true },
        orderBy: { id: 'desc' },
        take: TRAIN_LIMIT,
      }),
      this.prisma.category.findMany({ where: { parentId: { not: null }, isActive: true }, select: { id: true, nameUz: true } }),
      this.prisma.knowledgeArticle.findMany({ where: { isPublished: true, category: { parentId: { not: null } } }, select: { categoryId: true, title: true, body: true } }),
    ]);
    const docs: TrainingDoc[] = tickets.map((t) => ({ label: t.categoryId!, text: t.description }));
    // Mavzu nomi va bilimlar bazasi maqolasi: yangi (hali murojaati yo'q) mavzular ham taklif qilinishi uchun
    for (const topic of topics) for (let i = 0; i < 3; i++) docs.push({ label: topic.id, text: topic.nameUz });
    for (const a of articles) docs.push({ label: a.categoryId!, text: `${a.title} ${a.body}` });
    const model = train(docs);
    this.logger.log(`Mavzu klassifikatori o'qitildi: ${docs.length} hujjat, ${model.labels.length} mavzu, ${model.vocabulary} so'z (${Date.now() - started} ms)`);
    return model;
  }

  async suggest(text: string) {
    const settings = await this.settings.get('ai');
    const flags = scanKeywords(text, settings.keywordGroups);
    if (!settings.suggestions || text.trim().length < 10) return { topics: [], region: null, district: null, flags };
    const [model, regions, districts] = await Promise.all([
      this.classifier(),
      this.prisma.region.findMany({ select: { id: true, nameUz: true } }),
      this.prisma.district.findMany({ select: { id: true, nameUz: true, regionId: true } }),
    ]);
    const predictions = predict(model, text).filter((p) => p.probability >= 0.1);
    const categories = await this.prisma.category.findMany({
      where: { id: { in: predictions.map((p) => p.label) } },
      select: { id: true, nameUz: true, parent: { select: { id: true, nameUz: true } } },
    });
    const byId = new Map(categories.map((c) => [c.id, c]));
    const stem = (name: string) => normalizeText(name).replace(/\s+(viloyati|tumani|shahri|respublikasi)$/, '');
    const regionKeys = new Set(regions.map((r) => stem(r.nameUz)));
    const district = findPlace(text, districts.map((d) => ({ ...d, name: d.nameUz, exact: regionKeys.has(stem(d.nameUz)) })));
    const region = district
      ? regions.find((r) => r.id === district.regionId) ?? null
      : findPlace(text, regions.map((r) => ({ ...r, name: r.nameUz })));
    return {
      topics: predictions
        .filter((p) => byId.has(p.label))
        .map((p) => ({ id: p.label, name: byId.get(p.label)!.nameUz, parent: byId.get(p.label)!.parent, probability: p.probability })),
      region: region ? { id: region.id, name: region.nameUz } : null,
      district: district ? { id: district.id, name: district.nameUz } : null,
      flags,
    };
  }

  // ───────────── Kalit so'z belgilari ─────────────

  /** Yangi murojaat matnini tekshiradi: belgi qo'yadi va guruh sozlamasiga ko'ra xabar beradi. Xato murojaatni to'xtatmaydi. */
  async flagTicket(ticketId: number): Promise<KeywordHit[]> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, number: true, subject: true, description: true } });
    if (!ticket) return [];
    const { keywordGroups } = await this.settings.get('ai');
    const hits = scanKeywords(`${ticket.subject} ${ticket.description}`, keywordGroups);
    if (!hits.length) return [];
    await this.prisma.ticket.update({ where: { id: ticket.id }, data: { aiFlags: hits.map((h) => h.key) } });
    for (const hit of hits) {
      const group = keywordGroups.find((g) => g.key === hit.key);
      if (!group || group.notify === 'none') continue;
      const recipients =
        group.notify === 'confidential'
          ? (
              await this.prisma.user.findMany({
                where: { isActive: true, roles: { some: { role: { permissions: { has: Permission.TicketsConfidential } } } } },
                select: { id: true },
              })
            ).map((u) => u.id)
          : await this.notifications.supervisors();
      await this.notifications.notifyUsers(recipients, {
        type: 'ticket.ai_flag',
        title: `${hit.label}: ${ticket.number}`,
        // Matnning o'zi emas — faqat topilgan so'zlar (maxfiy murojaat mazmuni bildirishnomaga chiqmaydi)
        body: `Topilgan so'zlar: ${hit.words.join(', ')}`,
        link: `/tickets/${ticket.id}`,
      });
    }
    await this.audit.log({ action: 'ai.flag', entityType: 'Ticket', entityId: ticket.id, details: { number: ticket.number, flags: hits.map((h) => h.label) } });
    return hits;
  }

  // ───────────── Prognoz ─────────────

  async forecast(date?: string) {
    const now = new Date();
    const day = date ? new Date(`${date}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const from = new Date(day.getTime() - HISTORY_WEEKS * 7 * DAY_MS);
    const [calls, first, sl, ai] = await Promise.all([
      this.prisma.call.findMany({
        where: { direction: CallDirection.INBOUND, startedAt: { gte: from, lt: new Date(day.getTime() + DAY_MS) } },
        select: { startedAt: true, talkSeconds: true, result: true },
      }),
      this.prisma.call.findFirst({ where: { direction: CallDirection.INBOUND }, orderBy: { startedAt: 'asc' }, select: { startedAt: true } }),
      this.settings.get('service_level'),
      this.settings.get('ai'),
    ]);
    // kun → soat → qo'ng'iroqlar; AHT soat bo'yicha (oxirgi 4 hafta, javob berilganlar)
    const counts = new Map<string, number[]>();
    const talk = Array.from({ length: 24 }, () => ({ sum: 0, n: 0 }));
    const ahtFrom = day.getTime() - 28 * DAY_MS;
    for (const c of calls) {
      const key = dayKey(c.startedAt);
      let hours = counts.get(key);
      if (!hours) counts.set(key, (hours = Array(24).fill(0)));
      hours[c.startedAt.getHours()]++;
      if (c.result === CallResult.ANSWERED && c.talkSeconds > 0 && c.startedAt.getTime() >= ahtFrom && c.startedAt < day) {
        talk[c.startedAt.getHours()].sum += c.talkSeconds;
        talk[c.startedAt.getHours()].n++;
      }
    }
    const allTalk = talk.reduce((a, t) => ({ sum: a.sum + t.sum, n: a.n + t.n }), { sum: 0, n: 0 });
    const defaultAht = allTalk.n ? Math.round(allTalk.sum / allTalk.n) : 180;
    const firstDay = first ? new Date(first.startedAt.getFullYear(), first.startedAt.getMonth(), first.startedAt.getDate()) : day;
    const todayKey = dayKey(now);
    const isPast = day.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const isToday = dayKey(day) === todayKey;

    const hours = Array.from({ length: 24 }, (_, hour) => {
      const history = Array.from({ length: HISTORY_WEEKS }, (_, k) => {
        const d = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 7 * (k + 1));
        if (d < firstDay) return null;
        return counts.get(dayKey(d))?.[hour] ?? 0;
      });
      const expected = weightedForecast(history);
      const aht = talk[hour].n >= 5 ? Math.round(talk[hour].sum / talk[hour].n) : defaultAht;
      const staff = staffing({ callsPerHour: expected, ahtSeconds: aht, targetSeconds: sl.answerWithinSeconds, targetLevel: sl.targetPercent / 100, shrinkage: ai.shrinkage });
      const actualAvailable = isPast || (isToday && hour <= now.getHours());
      return {
        hour,
        expected,
        actual: actualAvailable ? counts.get(dayKey(day))?.[hour] ?? 0 : null,
        ahtSeconds: aht,
        traffic: staff.traffic,
        agents: staff.agents,
        scheduled: staff.scheduled,
        serviceLevel: staff.serviceLevel,
      };
    });
    const weeksUsed = Array.from({ length: HISTORY_WEEKS }, (_, k) => new Date(day.getFullYear(), day.getMonth(), day.getDate() - 7 * (k + 1))).filter((d) => d >= firstDay).length;
    return {
      date: dayKey(day),
      weeksUsed,
      target: { answerWithinSeconds: sl.answerWithinSeconds, targetPercent: sl.targetPercent },
      shrinkage: ai.shrinkage,
      totalExpected: Math.round(hours.reduce((s, h) => s + h.expected, 0)),
      totalActual: hours.some((h) => h.actual !== null) ? hours.reduce((s, h) => s + (h.actual ?? 0), 0) : null,
      peak: hours.reduce((best, h) => (h.expected > best.expected ? h : best), hours[0]),
      hours,
    };
  }

  // ───────────── Sozlamalar ─────────────

  getSettings() {
    return this.settings.get('ai');
  }

  async saveSettings(user: AuthUser, dto: AiSettingsDto) {
    const keys = dto.keywordGroups.map((g) => g.key);
    const value = {
      suggestions: dto.suggestions,
      shrinkage: dto.shrinkage,
      keywordGroups: dto.keywordGroups
        .filter((g, i) => keys.indexOf(g.key) === i)
        .map((g) => ({ ...g, label: g.label.trim(), words: [...new Set(g.words.map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 3))] })),
    };
    return this.settings.set('ai', value, user.id);
  }
}

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('suggest')
  @RequireAnyPermission(Permission.TicketsCreate, Permission.TicketsRoute)
  suggest(@Body() dto: SuggestDto) {
    return this.ai.suggest(dto.text);
  }

  @Get('forecast')
  @RequireAnyPermission(Permission.MonitoringView, Permission.ReportsView)
  forecast(@Query() query: ForecastQueryDto) {
    return this.ai.forecast(query.date);
  }

  @Get('settings')
  @RequirePermissions(Permission.SettingsManage)
  settings() {
    return this.ai.getSettings();
  }

  @Put('settings')
  @RequirePermissions(Permission.SettingsManage)
  saveSettings(@CurrentUser() user: AuthUser, @Body() dto: AiSettingsDto) {
    return this.ai.saveSettings(user, dto);
  }
}

@Global()
@Module({
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
