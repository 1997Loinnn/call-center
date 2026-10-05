import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AgentStatus, CallResult, DataScope, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { RequestMeta } from '../common/http';
import { maskPhone } from '../common/phone';
import { Period, startOfDay } from '../common/period';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../reports/analytics.service';
import { SettingsService } from '../settings/settings.service';
import { PBX_ADAPTER, PbxAdapter } from '../telephony/pbx-adapter';

export interface LiveAgent {
  id: number;
  fullName: string;
  sipExtension: string;
  status: AgentStatus;
  since: Date | null;
  reason: string | null;
  callsToday: number;
  avgTalkSeconds: number;
}

export interface LiveQueue {
  queue: string;
  name: string;
  language: string | null;
  callers: { number: string; waitSeconds: number }[];
}

/** Operatorlar ko'rish doirasi: foydalanuvchining roli bo'yicha (supervisor — o'z call-markazi). */
function agentScope(user: AuthUser): Prisma.UserWhereInput {
  switch (user.scope) {
    case DataScope.ALL:
      return {};
    case DataScope.UNIT_TREE:
      return { orgUnit: { path: { startsWith: user.orgUnitPath } } };
    case DataScope.UNIT:
      return { orgUnitId: user.orgUnitId };
    default:
      return { id: user.id };
  }
}

/**
 * Jonli holat (F-MON-01, F-MON-02): operatorlar holati, navbatdagi qo'ng'iroqlar va bugungi ko'rsatkichlar.
 * Operator holati agent_status_logs dagi ochiq yozuvdan, navbat — PBX adapteridan (UCM6510: AMI) olinadi.
 */
@Injectable()
export class MonitoringService {
  constructor(
    @Inject(PBX_ADAPTER) private readonly pbx: PbxAdapter,
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  get driver(): string {
    return this.pbx.name;
  }

  /** Faol, SIP raqamli xodimlar va ularning joriy holati (ochiq holat yozuvi bo'lmasa — oflayn). */
  async agents(where: Prisma.UserWhereInput = {}): Promise<LiveAgent[]> {
    const users = await this.prisma.user.findMany({
      where: { AND: [where, { isActive: true, sipExtension: { not: null } }] },
      select: { id: true, fullName: true, sipExtension: true },
      orderBy: { sipExtension: 'asc' },
    });
    const ids = users.map((u) => u.id);
    const [logs, calls] = await Promise.all([
      this.prisma.agentStatusLog.findMany({ where: { userId: { in: ids }, endedAt: null }, orderBy: { startedAt: 'desc' } }),
      this.prisma.call.groupBy({
        by: ['agentId'],
        where: { agentId: { in: ids }, result: CallResult.ANSWERED, startedAt: { gte: startOfDay(new Date()) } },
        _count: { _all: true },
        _avg: { talkSeconds: true },
      }),
    ]);
    const current = new Map<number, (typeof logs)[number]>();
    for (const log of logs) if (!current.has(log.userId)) current.set(log.userId, log);
    const callsBy = new Map(calls.map((c) => [c.agentId, c]));
    return users.map((u) => {
      const log = current.get(u.id);
      const c = callsBy.get(u.id);
      return {
        id: u.id,
        fullName: u.fullName,
        sipExtension: u.sipExtension!,
        status: log?.status ?? AgentStatus.OFFLINE,
        since: log?.startedAt ?? null,
        reason: log?.reason ?? null,
        callsToday: c?._count._all ?? 0,
        avgTalkSeconds: Math.round(c?._avg.talkSeconds ?? 0),
      };
    });
  }

  /** SIP trunklar holati; adapter bermasa — null. */
  trunks() {
    return this.pbx.trunkStatus().catch(() => null);
  }

  /** PBX navbatlari DB dagi nomlar bilan; adapter navbatni bermasa (UCM6510, AMI ulanmagan) — null. */
  async queues(rows?: { pbxNumber: string; name: string; language: string | null }[]): Promise<LiveQueue[] | null> {
    const [snapshot, queues] = await Promise.all([
      this.pbx.queueSnapshot().catch(() => null),
      rows ?? this.prisma.queue.findMany({ where: { isActive: true }, orderBy: { pbxNumber: 'asc' } }),
    ]);
    if (!snapshot) return null;
    const byNumber = new Map(snapshot.map((s) => [s.queue, s]));
    return queues
      .filter((q) => byNumber.has(q.pbxNumber))
      .map((q) => ({
        queue: q.pbxNumber,
        name: q.name,
        language: q.language,
        callers: byNumber.get(q.pbxNumber)!.callers.map((c) => ({ number: c.callerNumber, waitSeconds: c.waitSeconds })),
      }));
  }

  async live(user: AuthUser, queueFilter?: string) {
    const today: Period = { from: startOfDay(new Date()), to: new Date(), bucket: 'hour' };
    const queueWhere = queueFilter ? { queue: { pbxNumber: queueFilter } } : {};
    const queueRows = await this.prisma.queue.findMany({ where: { isActive: true }, orderBy: { pbxNumber: 'asc' } });
    const [agents, queues, serviceLevel, inbound, workHours] = await Promise.all([
      this.agents(agentScope(user)),
      this.queues(queueRows),
      this.settings.get('service_level'),
      this.prisma.call.findMany({
        where: this.analytics.callWhere(user, today, { direction: 'INBOUND', ...queueWhere }),
        select: { startedAt: true, result: true, waitSeconds: true, talkSeconds: true },
      }),
      this.analytics.workHours(),
    ]);
    const visibleQueues = (queues ?? []).filter((q) => !queueFilter || q.queue === queueFilter);
    const waiting = visibleQueues.flatMap((q) => q.callers.map((c) => ({ ...c, number: maskPhone(c.number), queue: q.queue, queueName: q.name })));
    const byStatus = Object.fromEntries(Object.values(AgentStatus).map((s) => [s, agents.filter((a) => a.status === s).length])) as Record<AgentStatus, number>;
    const kpi = this.analytics.callKpi(inbound, serviceLevel.answerWithinSeconds);

    return {
      updatedAt: new Date(),
      driver: this.pbx.name,
      queueSupported: queues !== null,
      serviceLevel,
      kpi: {
        waiting: waiting.length,
        longestWaitSeconds: Math.max(0, ...waiting.map((w) => w.waitSeconds)),
        ...kpi,
        agentsTotal: agents.length,
        agentsOnline: agents.length - byStatus.OFFLINE,
        byStatus,
      },
      agents,
      waiting: waiting.sort((a, b) => b.waitSeconds - a.waitSeconds),
      queues: queueRows.map((q) => ({ queue: q.pbxNumber, name: q.name, language: q.language })),
      hourly: this.analytics.series(inbound, today, workHours),
    };
  }

  /** Supervisor operator suhbatini o'z telefonida tinglaydi; har bir tinglash audit jurnaliga yoziladi. */
  async listen(user: AuthUser, agentId: number, meta: RequestMeta): Promise<void> {
    if (!user.sipExtension) throw new BadRequestException('Tinglash uchun sizga SIP ichki raqam biriktirilishi kerak');
    const agent = await this.prisma.user.findFirst({ where: { AND: [agentScope(user), { id: agentId, isActive: true }] }, select: { id: true, fullName: true, sipExtension: true } });
    if (!agent?.sipExtension) throw new NotFoundException('Operator topilmadi');
    try {
      await this.pbx.listen(user.sipExtension, agent.sipExtension);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : String(err));
    }
    await this.audit.log({
      actorId: user.id,
      action: 'call.listen',
      entityType: 'User',
      entityId: agent.id,
      details: { agent: agent.fullName, sip: agent.sipExtension, supervisorSip: user.sipExtension },
      ...meta,
    });
  }
}
