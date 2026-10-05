import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentStatus, AlertSeverity, AlertStatus, CallDirection, CallResult, Prisma } from '@prisma/client';
import { statfs } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../integrations/notifications.service';
import { AuthUser } from '../common/auth-user';
import { pageArgs, Page } from '../common/http';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';
import { alertKey, alertMessage, formatThreshold, Observation, planAlerts } from './alert-rules';
import { AlertsQueryDto, AlertSettingsDto } from './monitoring.dto';
import { MonitoringService } from './monitoring.service';

const OPEN: AlertStatus[] = [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED];
const EVALUATE_EVERY_MS = 30_000;
// Bir nechta backend nusxasi ishlasa, baholashni faqat bittasi bajaradi (pg_try_advisory_xact_lock)
const EVALUATOR_LOCK = 1097_0301;
const MAX_THRESHOLD: Record<string, number> = { seconds: 86_400, percent: 100, count: 1000 };
// Tebranishga qarshi: holat shuncha baholash davomida (≈1 daqiqa) tiklangan bo'lsagina avtomatik yopiladi
const RECOVERY_CHECKS = 2;
// Bir xil ogohlantirish (limit + manba) bo'yicha supervisorlarga bildirishnoma shu oraliqda ko'pi bilan bir marta
const NOTIFY_COOLDOWN_MS = 15 * 60_000;

const ALERT_INCLUDE = {
  rule: { select: { id: true, code: true, name: true, unit: true, threshold: true } },
  acknowledgedBy: { select: { id: true, fullName: true } },
  resolvedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.AlertInclude;

/**
 * Ogohlantirishlar (F-MON-03): ro'yxat, "Qabul qildim" / "Yopish", limitlar va xabar berish sozlamasi.
 * Har 30 soniyada ko'rsatkichlar limitlar bilan solishtiriladi: chegaradan oshsa ogohlantirish ochiladi
 * (supervisorlarga bildirishnoma), holat tiklansa avtomatik yopiladi.
 */
@Injectable()
export class AlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  /** Qo'lda yopilgan va holati hali tiklanmagan (qoida|manba) kalitlari — qayta ochilmaydi */
  private readonly suppressed = new Set<string>();
  /** Ochiq ogohlantirish id → ketma-ket "tiklandi" baholashlar soni */
  private readonly recovering = new Map<number, number>();
  /** (limit|manba) → oxirgi bildirishnoma vaqti */
  private readonly notifiedAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
    private readonly settings: SettingsService,
    private readonly monitoring: MonitoringService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('ALERTS_EVALUATOR') === 'false') return;
    this.timer = setInterval(() => void this.evaluate(), EVALUATE_EVERY_MS);
    this.timer.unref();
    setTimeout(() => void this.evaluate(), 5_000).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ───────────── Ro'yxat va amallar ─────────────

  async list(query: AlertsQueryDto): Promise<Page<Prisma.AlertGetPayload<{ include: typeof ALERT_INCLUDE }>>> {
    const history = query.tab === 'history';
    const where: Prisma.AlertWhereInput = {
      status: history ? AlertStatus.RESOLVED : { in: OPEN },
      severity: query.severity,
      OR: query.search
        ? [{ message: { contains: query.search, mode: 'insensitive' } }, { source: { contains: query.search, mode: 'insensitive' } }]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.alert.findMany({
        where,
        include: ALERT_INCLUDE,
        // Enum tartibi: CRITICAL, WARNING, INFO — kritiklar tepada
        orderBy: history ? [{ resolvedAt: 'desc' }, { id: 'desc' }] : [{ severity: 'asc' }, { startedAt: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.alert.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async counts() {
    const [critical, warning, resolved] = await Promise.all([
      this.prisma.alert.count({ where: { status: { in: OPEN }, severity: AlertSeverity.CRITICAL } }),
      this.prisma.alert.count({ where: { status: { in: OPEN }, severity: { not: AlertSeverity.CRITICAL } } }),
      this.prisma.alert.count({ where: { status: AlertStatus.RESOLVED } }),
    ]);
    return { critical, warning, active: critical + warning, resolved };
  }

  async acknowledge(user: AuthUser, id: number) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Ogohlantirish topilmadi');
    if (alert.status !== AlertStatus.ACTIVE) throw new ConflictException('Ogohlantirish allaqachon qabul qilingan yoki yopilgan');
    const updated = await this.prisma.alert.update({
      where: { id },
      data: { status: AlertStatus.ACKNOWLEDGED, acknowledgedAt: new Date(), acknowledgedById: user.id },
      include: ALERT_INCLUDE,
    });
    await this.audit.log({ actorId: user.id, action: 'alert.acknowledge', entityType: 'Alert', entityId: id, details: { message: alert.message } });
    this.changed();
    return updated;
  }

  async resolve(user: AuthUser, id: number) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Ogohlantirish topilmadi');
    if (alert.status === AlertStatus.RESOLVED) throw new ConflictException('Ogohlantirish allaqachon yopilgan');
    const updated = await this.prisma.alert.update({
      where: { id },
      data: { status: AlertStatus.RESOLVED, resolvedAt: new Date(), resolvedById: user.id },
      include: ALERT_INCLUDE,
    });
    // Muammo davom etsa, holat tiklanmaguncha shu ogohlantirish qayta ochilmaydi
    if (alert.ruleId) this.suppressed.add(alertKey(alert.ruleId, alert.source));
    await this.audit.log({ actorId: user.id, action: 'alert.resolve', entityType: 'Alert', entityId: id, details: { message: alert.message } });
    this.changed();
    return updated;
  }

  // ───────────── Limitlar va xabar berish ─────────────

  async getSettings() {
    const [rules, notify] = await Promise.all([this.prisma.alertRule.findMany({ orderBy: { id: 'asc' } }), this.settings.get('alert_notify')]);
    return { rules, notify };
  }

  async saveSettings(user: AuthUser, dto: AlertSettingsDto) {
    const rules = await this.prisma.alertRule.findMany({ where: { id: { in: dto.rules.map((r) => r.id) } } });
    const byId = new Map(rules.map((r) => [r.id, r]));
    for (const item of dto.rules) {
      const rule = byId.get(item.id);
      if (!rule) throw new BadRequestException(`Limit topilmadi: ${item.id}`);
      if (item.threshold > (MAX_THRESHOLD[rule.unit] ?? 1_000_000)) throw new BadRequestException(`"${rule.name}" limiti juda katta`);
    }

    const changed = dto.rules.filter((item) => {
      const rule = byId.get(item.id)!;
      return rule.threshold !== item.threshold || rule.isActive !== item.isActive;
    });
    await this.prisma.$transaction(changed.map((item) => this.prisma.alertRule.update({ where: { id: item.id }, data: { threshold: item.threshold, isActive: item.isActive } })));
    for (const item of changed) {
      const rule = byId.get(item.id)!;
      const changes: Record<string, { from: string | boolean; to: string | boolean }> = {};
      if (rule.threshold !== item.threshold) {
        changes.threshold = { from: formatThreshold(rule.metric, rule.unit, rule.threshold), to: formatThreshold(rule.metric, rule.unit, item.threshold) };
      }
      if (rule.isActive !== item.isActive) changes.isActive = { from: rule.isActive, to: item.isActive };
      await this.audit.log({ actorId: user.id, action: 'alert_rule.update', entityType: 'AlertRule', entityId: rule.id, details: { name: rule.name, changes } });
    }

    const before = await this.settings.get('alert_notify');
    const notify = await this.settings.set('alert_notify', dto.notify, user.id);
    const notifyChanges = Object.fromEntries(
      (Object.keys(notify) as (keyof typeof notify)[]).filter((k) => notify[k] !== before[k]).map((k) => [k, { from: before[k], to: notify[k] }]),
    );
    if (Object.keys(notifyChanges).length > 0) {
      await this.audit.log({ actorId: user.id, action: 'settings.update', entityType: 'Setting', entityId: 'alert_notify', details: { name: 'Ogohlantirish xabarlari', changes: notifyChanges } });
    }
    if (changed.length > 0) void this.evaluate();
    return this.getSettings();
  }

  // ───────────── Avtomatik baholash ─────────────

  /** Ko'rsatkichlarni yig'adi va ogohlantirishlarni ochadi/yangilaydi/yopadi. Xato bo'lsa keyingi safar qayta uriniladi. */
  async evaluate(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { observations, measured } = await this.observe();
      const events = await this.prisma.$transaction(async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${EVALUATOR_LOCK}::bigint) AS locked`;
        if (!locked) return null;
        const [rules, open] = await Promise.all([
          tx.alertRule.findMany(),
          tx.alert.findMany({ where: { status: { in: OPEN } }, select: { id: true, ruleId: true, source: true, value: true, details: true } }),
        ]);
        const plan = planAlerts(rules, observations, measured, open, this.suppressed);
        const created = [];
        for (const { rule, observation } of plan.create) {
          created.push(
            await tx.alert.create({
              data: {
                ruleId: rule.id,
                severity: rule.severity,
                message: alertMessage(rule, observation),
                source: observation.source,
                value: observation.value,
                details: { ...observation.details, threshold: rule.threshold, unit: rule.unit },
              },
            }),
          );
        }
        for (const { alertId, rule, observation } of plan.update) {
          await tx.alert.update({ where: { id: alertId }, data: { value: observation.value, message: alertMessage(rule, observation) } });
        }
        const detailsOf = new Map(open.map((a) => [a.id, a.details]));
        // "Tiklandi" qarori bir necha baholashda tasdiqlanadi; boshqa sabablar (og'irroq limit, limit o'chirildi) darhol
        const resolving = plan.resolve.filter(({ alertId, reason }) => {
          if (reason !== 'recovered') return true;
          const streak = (this.recovering.get(alertId) ?? 0) + 1;
          this.recovering.set(alertId, streak);
          return streak >= RECOVERY_CHECKS;
        });
        const stillOpen = new Set(open.map((a) => a.id).filter((id) => !plan.resolve.some((r) => r.alertId === id)));
        for (const id of [...this.recovering.keys()]) {
          if (stillOpen.has(id) || resolving.some((r) => r.alertId === id) || !open.some((a) => a.id === id)) this.recovering.delete(id);
        }
        for (const { alertId, reason } of resolving) {
          const previous = detailsOf.get(alertId);
          const details = { ...(previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {}), autoResolved: reason };
          await tx.alert.update({ where: { id: alertId }, data: { status: AlertStatus.RESOLVED, resolvedAt: new Date(), details } });
        }
        for (const key of plan.release) this.suppressed.delete(key);
        return { created, changed: plan.create.length + plan.update.length + resolving.length > 0 };
      });
      if (!events) return;
      if (events.created.length > 0) await this.notify(events.created);
      if (events.changed) this.changed();
    } catch (err) {
      this.logger.error('Ogohlantirishlarni baholab bo\'lmadi', err instanceof Error ? err.stack : String(err));
    } finally {
      this.running = false;
    }
  }

  /** Joriy ko'rsatkichlar. PBX navbat yoki trunk holatini bermasa, o'sha ko'rsatkichlar o'lchanmagan hisoblanadi. */
  private async observe(): Promise<{ observations: Observation[]; measured: Set<string> }> {
    const observations: Observation[] = [];
    const measured = new Set<string>(['calls.abandoned_rate_1h', 'agent.break_seconds']);
    const pbxLabel = this.monitoring.driver === 'mock' ? 'Test PBX' : 'UCM6510';
    const now = Date.now();

    const [queues, agents, lastHour] = await Promise.all([
      this.monitoring.queues(),
      this.monitoring.agents(),
      this.prisma.call.groupBy({
        by: ['result'],
        where: { direction: CallDirection.INBOUND, startedAt: { gte: new Date(now - 3_600_000) } },
        _count: { _all: true },
      }),
    ]);

    if (queues) {
      measured.add('queue.longest_wait').add('queue.waiting_without_agents');
      const ready = agents.filter((a) => a.status === AgentStatus.READY).length;
      for (const q of queues) {
        if (q.callers.length === 0) continue;
        const source = `${pbxLabel} · navbat ${q.queue}`;
        const label = `${q.name} (${q.queue})`;
        observations.push({ metric: 'queue.longest_wait', source, label, value: Math.max(...q.callers.map((c) => c.waitSeconds)), details: { queue: q.queue } });
        if (ready === 0) observations.push({ metric: 'queue.waiting_without_agents', source, label, value: q.callers.length, details: { queue: q.queue } });
      }
    }

    const count = (results: CallResult[]) => lastHour.filter((g) => g.result && results.includes(g.result)).reduce((s, g) => s + g._count._all, 0);
    const offered = lastHour.filter((g) => g.result !== CallResult.IVR_ONLY).reduce((s, g) => s + g._count._all, 0);
    // Kam qo'ng'iroqda ulush tasodifiy tebranadi: kamida 10 ta bo'lsa baholanadi
    if (offered >= 10) {
      const lost = count([CallResult.ABANDONED, CallResult.NO_ANSWER]);
      observations.push({ metric: 'calls.abandoned_rate_1h', source: `${pbxLabel} · barcha navbatlar`, label: 'Barcha navbatlar', value: Math.round((lost / offered) * 100), details: { offered, lost } });
    }

    for (const a of agents) {
      if (a.status === AgentStatus.BREAK && a.since) {
        observations.push({
          metric: 'agent.break_seconds',
          source: `Operator · SIP ${a.sipExtension}`,
          label: a.fullName,
          value: Math.round((now - a.since.getTime()) / 1000),
          details: { agentId: a.id, reason: a.reason },
        });
      }
    }

    const trunks = await this.monitoring.trunks();
    if (trunks) {
      measured.add('trunk.down_seconds');
      for (const t of trunks) {
        if (!t.up && t.since) observations.push({ metric: 'trunk.down_seconds', source: `${pbxLabel} · trunk ${t.name}`, label: t.name, value: Math.round((now - t.since.getTime()) / 1000) });
      }
    }

    const dir = resolvePath(this.config.get<string>('RECORDINGS_DIR') ?? 'storage/recordings');
    const disk = await statfs(dir).catch(() => statfs(resolvePath('.')).catch(() => null));
    if (disk && disk.blocks > 0) {
      measured.add('storage.recordings_used');
      const used = Math.round(((disk.blocks - disk.bavail) / disk.blocks) * 100);
      observations.push({ metric: 'storage.recordings_used', source: `Yozuvlar arxivi · ${dir}`, label: 'Yozuvlar arxivi', value: used });
    }
    return { observations, measured };
  }

  /**
   * Yangi ogohlantirish (sozlamaga ko'ra): supervisorlarga tizim ichida (kritiklari emailga ham),
   * Telegram guruhiga (TELEGRAM_ALERTS_CHAT_ID) va SMS (supervisor telefoniga, SMS shlyuzi orqali).
   */
  private async notify(created: { id: number; ruleId: number | null; source: string; severity: AlertSeverity; message: string }[]): Promise<void> {
    const notify = await this.settings.get('alert_notify');
    if (!notify.bell && !notify.telegram && !notify.sms) return;
    const now = Date.now();
    const fresh = created.filter((alert) => {
      const key = alertKey(alert.ruleId ?? 0, alert.source);
      if (now - (this.notifiedAt.get(key) ?? 0) < NOTIFY_COOLDOWN_MS) return false;
      this.notifiedAt.set(key, now);
      return true;
    });
    if (fresh.length === 0) return;
    const supervisors = await this.prisma.user.findMany({ where: { isActive: true, roles: { some: { role: { code: 'SUPERVISOR' } } } }, select: { id: true } });
    for (const alert of fresh) {
      const critical = alert.severity === AlertSeverity.CRITICAL;
      const title = critical ? 'Kritik ogohlantirish' : 'Ogohlantirish';
      if (notify.bell && supervisors.length > 0) {
        await this.notifications.notifyUsers(
          supervisors.map((s) => s.id),
          { type: critical ? 'alert.critical' : 'alert.warning', title, body: alert.message, link: '/alerts' },
        );
      }
      if (notify.telegram) await this.notifications.telegramGroup(`${title}\n${alert.message}\n${alert.source}`);
      // SMS faqat kritik ogohlantirishlar uchun (supervisor telefoniga)
      if (notify.sms && critical) await this.notifications.smsStaff(supervisors.map((s) => s.id), `1097 ${title}: ${alert.message}`);
    }
  }

  private changed(): void {
    this.realtime.emitToRoom('monitoring', 'alerts.changed', { at: new Date() });
  }
}
