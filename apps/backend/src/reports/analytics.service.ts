import { Injectable } from '@nestjs/common';
import { CallDirection, CallResult, Prisma, TariffDirection, TicketEventType, TicketStatus } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { callScopeWhere, ticketScopeWhere } from '../common/data-scope';
import { addDays, dayKey, Period, startOfDay } from '../common/period';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/** "Joyida hal qilindi": murojaat ijroga yuborilmasdan, qabul qilingan zahoti yopilgan (F-OP-07). */
export const RESOLVED_ON_SPOT: Prisma.TicketWhereInput = {
  events: { some: { type: TicketEventType.CLOSED, fromStatus: TicketStatus.NEW } },
};

export const TARIFF_LABELS: Record<TariffDirection, string> = {
  MOBILE: 'Mobil',
  LOCAL: 'Shahar',
  LONG_DISTANCE: 'Shaharlararo',
  INTERNATIONAL: 'Xalqaro',
  INBOUND: 'Kiruvchi 1097',
};

const OUTBOUND_DIRECTIONS: TariffDirection[] = [TariffDirection.MOBILE, TariffDirection.LOCAL, TariffDirection.LONG_DISTANCE, TariffDirection.INTERNATIONAL];
const LOST: CallResult[] = [CallResult.ABANDONED, CallResult.NO_ANSWER];

const percent = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const average = (values: number[]): number => (values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0);

export interface InboundBucket {
  key: string;
  label: string;
  total: number;
  answered: number;
  lost: number;
}

export interface CallKpi {
  inbound: number;
  /** IVR'da yakunlanganlarsiz — operatorga yo'naltirilgan qo'ng'iroqlar */
  offered: number;
  answered: number;
  lost: number;
  answeredPercent: number | null;
  /** Xizmat darajasi: N soniyada javob berilganlar / (javob berilgan + uzilgan) */
  slaPercent: number | null;
  avgWaitSeconds: number;
  avgTalkSeconds: number;
}

/**
 * Analitika va hisobotlar (F-REP-01..04, F-BIL-04): qo'ng'iroqlar, murojaatlar, operatorlar samaradorligi
 * va xarajatlar. Barcha ko'rsatkichlar foydalanuvchining ko'rish doirasi bo'yicha hisoblanadi.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  callWhere(user: AuthUser, period: Period, extra: Prisma.CallWhereInput = {}): Prisma.CallWhereInput {
    return { AND: [callScopeWhere(user), { startedAt: { gte: period.from, lte: period.to } }, extra] };
  }

  ticketWhere(user: AuthUser, period: Period, extra: Prisma.TicketWhereInput = {}): Prisma.TicketWhereInput {
    return { AND: [ticketScopeWhere(user), { createdAt: { gte: period.from, lte: period.to } }, extra] };
  }

  async analytics(user: AuthUser, period: Period) {
    const [serviceLevel, inbound, ticketsCreated, resolvedOnSpot, topTopics, operators, billing, workHours] = await Promise.all([
      this.settings.get('service_level'),
      this.inboundCalls(user, period),
      this.prisma.ticket.count({ where: this.ticketWhere(user, period) }),
      this.prisma.ticket.count({ where: this.ticketWhere(user, period, RESOLVED_ON_SPOT) }),
      this.topTopics(user, period, 8),
      this.operators(user, period),
      this.billing(user, period),
      this.workHours(),
    ]);
    return {
      period,
      serviceLevel,
      calls: this.callKpi(inbound, serviceLevel.answerWithinSeconds),
      tickets: { created: ticketsCreated, resolvedOnSpot, resolvedOnSpotPercent: percent(resolvedOnSpot, ticketsCreated) },
      inboundSeries: this.series(inbound, period, workHours),
      topTopics,
      operators,
      billing,
    };
  }

  /** Ish vaqti soatlari: 09:00–18:00 → { start: 9, end: 17 } (oxirgi to'liq soat). */
  async workHours(): Promise<{ start: number; end: number }> {
    const wh = await this.settings.get('working_hours');
    const start = Number(wh.start.slice(0, 2));
    const end = Number(wh.end.slice(0, 2)) - (wh.end.endsWith(':00') ? 1 : 0);
    return { start, end: Math.max(start, end) };
  }

  inboundCalls(user: AuthUser, period: Period) {
    return this.prisma.call.findMany({
      where: this.callWhere(user, period, { direction: CallDirection.INBOUND }),
      select: { startedAt: true, result: true, waitSeconds: true, talkSeconds: true },
    });
  }

  callKpi(calls: { result: CallResult | null; waitSeconds: number; talkSeconds: number }[], answerWithinSeconds: number): CallKpi {
    const answered = calls.filter((c) => c.result === CallResult.ANSWERED);
    const lost = calls.filter((c) => c.result && LOST.includes(c.result)).length;
    const offered = calls.filter((c) => c.result !== CallResult.IVR_ONLY).length;
    const withinSla = answered.filter((c) => c.waitSeconds <= answerWithinSeconds).length;
    return {
      inbound: calls.length,
      offered,
      answered: answered.length,
      lost,
      answeredPercent: percent(answered.length, offered),
      slaPercent: percent(withinSla, answered.length + lost),
      avgWaitSeconds: average(answered.map((c) => c.waitSeconds)),
      avgTalkSeconds: average(answered.map((c) => c.talkSeconds)),
    };
  }

  /**
   * Kiruvchi qo'ng'iroqlar grafigi: bo'sh kunlar (soatlar) ham ustun bo'lib chiqadi. Soatlik grafik ish vaqti
   * oralig'ida (Tizim → Sozlamalar), undan tashqaridagi qo'ng'iroqlar bo'lsa — ular ham qamraladi.
   */
  series(calls: { startedAt: Date; result: CallResult | null }[], period: Period, workHours = { start: 9, end: 17 }): InboundBucket[] {
    const buckets = new Map<string, InboundBucket>();
    if (period.bucket === 'day') {
      for (let d = startOfDay(period.from); d <= period.to; d = addDays(d, 1)) {
        const key = dayKey(d);
        buckets.set(key, { key, label: `${key.slice(8, 10)}.${key.slice(5, 7)}`, total: 0, answered: 0, lost: 0 });
      }
    } else {
      const hours = calls.map((c) => c.startedAt.getHours());
      const last = period.to.getHours();
      for (let h = Math.min(workHours.start, ...hours); h <= Math.max(workHours.end, last, ...hours); h++) {
        const key = String(h).padStart(2, '0');
        buckets.set(key, { key, label: key, total: 0, answered: 0, lost: 0 });
      }
    }
    for (const call of calls) {
      const key = period.bucket === 'day' ? dayKey(call.startedAt) : String(call.startedAt.getHours()).padStart(2, '0');
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.total++;
      if (call.result === CallResult.ANSWERED) bucket.answered++;
      else if (call.result && LOST.includes(call.result)) bucket.lost++;
    }
    return [...buckets.values()];
  }

  /** Mavzular bo'yicha murojaatlar: asosiy mavzu (tickets.categoryId) va qo'shimcha mavzular (ticket_topics) birga. */
  async topicCounts(user: AuthUser, period: Period, extra: Prisma.TicketWhereInput = {}): Promise<Map<number, number>> {
    const [primary, additional] = await Promise.all([
      this.prisma.ticket.groupBy({ by: ['categoryId'], where: this.ticketWhere(user, period, { AND: [extra, { categoryId: { not: null } }] }), _count: { _all: true } }),
      this.prisma.ticketTopic.groupBy({ by: ['categoryId'], where: { ticket: this.ticketWhere(user, period, extra) }, _count: { _all: true } }),
    ]);
    const counts = new Map<number, number>();
    for (const g of primary) counts.set(g.categoryId!, (counts.get(g.categoryId!) ?? 0) + g._count._all);
    for (const g of additional) counts.set(g.categoryId, (counts.get(g.categoryId) ?? 0) + g._count._all);
    return counts;
  }

  async topTopics(user: AuthUser, period: Period, take?: number) {
    const counts = await this.topicCounts(user, period);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, take);
    const categories = await this.prisma.category.findMany({
      where: { id: { in: ranked.map(([id]) => id) } },
      select: { id: true, nameUz: true, sortOrder: true, parentId: true, parent: { select: { nameUz: true } } },
    });
    const byId = new Map(categories.map((c) => [c.id, c]));
    return ranked.map(([categoryId, count]) => {
      const c = byId.get(categoryId);
      return { categoryId, number: c?.parentId ? c.sortOrder : null, name: c?.nameUz ?? '—', parent: c?.parent?.nameUz ?? null, count };
    });
  }

  /** Operatorlar samaradorligi: javob bergan qo'ng'iroqlari, yaratgan murojaatlari, joyida hal ulushi va sifat bahosi. */
  async operators(user: AuthUser, period: Period) {
    const [calls, tickets, onSpot] = await Promise.all([
      this.prisma.call.groupBy({
        by: ['agentId'],
        where: this.callWhere(user, period, { result: CallResult.ANSWERED, agentId: { not: null } }),
        _count: { _all: true },
        _avg: { talkSeconds: true },
      }),
      this.prisma.ticket.groupBy({ by: ['createdById'], where: this.ticketWhere(user, period, { createdById: { not: null } }), _count: { _all: true } }),
      this.prisma.ticket.groupBy({
        by: ['createdById'],
        where: this.ticketWhere(user, period, { AND: [RESOLVED_ON_SPOT, { createdById: { not: null } }] }),
        _count: { _all: true },
      }),
    ]);
    const ids = [...new Set([...calls.map((c) => c.agentId!), ...tickets.map((t) => t.createdById!)])];
    const [users, qa] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, sipExtension: true } }),
      this.prisma.qaEvaluation.groupBy({ by: ['agentId'], where: { agentId: { in: ids }, createdAt: { gte: period.from, lte: period.to } }, _avg: { score: true } }),
    ]);
    const callsBy = new Map(calls.map((c) => [c.agentId!, c]));
    const ticketsBy = new Map(tickets.map((t) => [t.createdById!, t._count._all]));
    const onSpotBy = new Map(onSpot.map((t) => [t.createdById!, t._count._all]));
    const qaBy = new Map(qa.map((q) => [q.agentId, q._avg.score]));
    return users
      .map((u) => {
        const c = callsBy.get(u.id);
        const created = ticketsBy.get(u.id) ?? 0;
        const score = qaBy.get(u.id);
        return {
          id: u.id,
          fullName: u.fullName,
          sipExtension: u.sipExtension,
          calls: c?._count._all ?? 0,
          avgTalkSeconds: Math.round(c?._avg.talkSeconds ?? 0),
          tickets: created,
          resolvedOnSpotPercent: percent(onSpotBy.get(u.id) ?? 0, created),
          // QA varaqasi 0..100 ball, jadvalda 5 ballik shkala
          rating: score === null || score === undefined ? null : Math.round((score / 20) * 10) / 10,
        };
      })
      .filter((o) => o.calls > 0 || o.sipExtension)
      .sort((a, b) => b.calls - a.calls || b.tickets - a.tickets);
  }

  /** Qo'ng'iroqlar xarajati tarif yo'nalishlari bo'yicha (summalar tarif jadvalidan, namuna). */
  async billing(user: AuthUser, period: Period) {
    const callWhere = this.callWhere(user, period);
    const [charges, inbound] = await Promise.all([
      this.prisma.callCharge.groupBy({ by: ['tariffId'], where: { call: callWhere }, _count: { _all: true }, _sum: { amount: true, billableSec: true } }),
      this.prisma.call.aggregate({
        where: this.callWhere(user, period, { direction: CallDirection.INBOUND, result: CallResult.ANSWERED }),
        _count: { _all: true },
        _sum: { talkSeconds: true },
      }),
    ]);
    const tariffs = await this.prisma.tariff.findMany({ where: { id: { in: charges.map((c) => c.tariffId).filter((id): id is number => id !== null) } } });
    const directionOf = new Map(tariffs.map((t) => [t.id, t.direction]));
    const rows = OUTBOUND_DIRECTIONS.map((direction) => {
      const items = charges.filter((c) => c.tariffId !== null && directionOf.get(c.tariffId) === direction);
      return {
        direction,
        label: TARIFF_LABELS[direction],
        calls: items.reduce((sum, c) => sum + c._count._all, 0),
        minutes: Math.round(items.reduce((sum, c) => sum + (c._sum.billableSec ?? 0), 0) / 60),
        amount: items.reduce((sum, c) => sum + Number(c._sum.amount ?? 0), 0),
      };
    });
    return {
      rows,
      inbound: { calls: inbound._count._all, minutes: Math.round((inbound._sum.talkSeconds ?? 0) / 60) },
      total: rows.reduce((sum, r) => sum + r.amount, 0),
    };
  }
}
