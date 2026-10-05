import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CallDirection, CallResult, ExportFormat, TicketStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { hasPermission, ticketScopeWhere } from '../common/data-scope';
import { RequestMeta } from '../common/http';
import { buildTablePdf, PDF_MIME } from '../common/pdf';
import { customRange, dayKey, describePeriod, formatSeconds, Period } from '../common/period';
import { Permission } from '../common/permissions';
import { buildXlsx, CellValue, XLSX_MIME } from '../common/xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { CHANNEL_LABELS, csvCell, formatExportDate, formatExportPhone, TYPE_LABELS } from '../tickets/ticket-export';
import { STATUS_LABELS } from '../tickets/ticket-workflow';
import { AnalyticsService, RESOLVED_ON_SPOT, TARIFF_LABELS } from './analytics.service';
import { isReportSource, ReportSourceKey, REPORT_SOURCES, resolveColumns } from './report-sources';

type Row = Record<string, CellValue>;

export interface ReportFile {
  fileName: string;
  mime: string;
  body: Buffer;
}

/** Bitta eksportdagi eng ko'p qator (ro'yxatli manbalar uchun). */
const ROW_LIMIT = 20_000;
const DAY_MS = 86_400_000;

const CALL_RESULT_LABELS: Record<CallResult, string> = {
  ANSWERED: 'Javob berildi',
  ABANDONED: 'Kutib uzildi',
  NO_ANSWER: 'Javobsiz',
  BUSY: 'Band',
  FAILED: 'Xato',
  IVR_ONLY: 'IVR da yakunlandi',
  VOICEMAIL: 'Ovozli xabar',
};
const DIRECTION_LABELS: Record<CallDirection, string> = { INBOUND: 'Kiruvchi', OUTBOUND: 'Chiquvchi', INTERNAL: 'Ichki' };
const OPEN: TicketStatus[] = [TicketStatus.NEW, TicketStatus.ROUTED, TicketStatus.IN_PROGRESS, TicketStatus.ANSWERED, TicketStatus.RETURNED];

const pct = (value: number | null): CellValue => (value === null ? null : `${value}%`);

/** Fayl nomidagi sana: 2026-10-03 */
const stamp = (date: Date) => dayKey(date);

/**
 * Eksport shablonlari bo'yicha hisobot fayllari (F-REP-05): XLSX, CSV yoki PDF.
 * Ma'lumot foydalanuvchining ko'rish doirasi bo'yicha olinadi, har bir yuklash audit jurnaliga yoziladi.
 */
@Injectable()
export class ReportExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
  ) {}

  async downloadTemplate(user: AuthUser, templateId: number, range: { from?: Date; to?: Date }, meta: RequestMeta): Promise<ReportFile> {
    const template = await this.prisma.exportTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new NotFoundException('Shablon topilmadi');
    if (!template.isActive) throw new BadRequestException("Shablon o'chirilgan");
    const { file, subtitle, rows } = await this.templateFile(user, template, customRange(range.from, range.to, '7d'));

    await this.audit.log({
      actorId: user.id,
      action: 'report.export',
      entityType: 'ExportTemplate',
      entityId: template.id,
      details: { name: template.name, format: template.format, source: template.source, period: subtitle, rows },
      ...meta,
    });
    return file;
  }

  /**
   * Shablon bo'yicha fayl foydalanuvchining ko'rish doirasida (yuklab olish va jadval bo'yicha yuborish uchun umumiy).
   * Audit yozuvini chaqiruvchi qiladi.
   */
  async templateFile(
    user: AuthUser,
    template: { id: number; code: string; name: string; format: ExportFormat; source: string; columns: string[] },
    period: Period,
  ): Promise<{ file: ReportFile; subtitle: string; rows: number }> {
    if (!isReportSource(template.source)) throw new BadRequestException("Shablon manbasi noma'lum");
    if (template.source === 'ticket_answer') throw new BadRequestException('Javob xati murojaat kartasidan yuklanadi');
    this.assertSourceAccess(user, template.source);

    const columns = resolveColumns(template.source, template.columns);
    const rows = await this.rows(user, template.source, period);
    const subtitle = REPORT_SOURCES[template.source].periodic ? describePeriod(period) : `Holat: ${formatExportDate(new Date())}`;
    const file = this.render(template.format, {
      title: template.name,
      subtitle,
      columns,
      rows: rows.map((row) => columns.map((column) => row[column] ?? null)),
      footer: `Yaratildi: ${formatExportDate(new Date())} · ${user.fullName}`,
      baseName: `${template.code}-${stamp(period.to)}`,
    });
    return { file, subtitle, rows: rows.length };
  }

  /** Analitika sahifasidagi "Eksport": barcha bloklar bitta XLSX faylda, har biri alohida varaqda. */
  async analyticsWorkbook(user: AuthUser, period: Period, meta: RequestMeta): Promise<ReportFile> {
    const data = await this.analytics.analytics(user, period);
    const c = data.calls;
    const body = buildXlsx([
      {
        name: "Ko'rsatkichlar",
        columns: ["Ko'rsatkich", 'Qiymat'],
        rows: [
          ['Davr', describePeriod(period)],
          ["Kiruvchi qo'ng'iroqlar", c.inbound],
          ['Operatorga yo\'naltirilgan (IVR dan tashqari)', c.offered],
          ['Javob berildi', c.answered],
          ['Javob berilgan ulush', pct(c.answeredPercent)],
          [`Xizmat darajasi (${data.serviceLevel.answerWithinSeconds} s)`, pct(c.slaPercent)],
          ['Uzilgan va javobsiz', c.lost],
          ["O'rtacha kutish", formatSeconds(c.avgWaitSeconds)],
          ["O'rtacha suhbat (AHT)", formatSeconds(c.avgTalkSeconds)],
          ['Murojaatlar yaratildi', data.tickets.created],
          ['Joyida hal qilindi', data.tickets.resolvedOnSpot],
          ['Joyida hal ulushi', pct(data.tickets.resolvedOnSpotPercent)],
        ],
      },
      {
        name: data.period.bucket === 'day' ? 'Kunlar bo\'yicha' : "Soatlar bo'yicha",
        columns: [data.period.bucket === 'day' ? 'Sana' : 'Soat', 'Kiruvchi', 'Javob berildi', 'Uzilgan'],
        rows: data.inboundSeries.map((b) => [b.label, b.total, b.answered, b.lost]),
      },
      { name: 'Mavzular', columns: ['Raqam', 'Toifa', 'Mavzu', 'Murojaatlar'], rows: data.topTopics.map((t) => [t.number, t.parent, t.name, t.count]) },
      {
        name: 'Operatorlar',
        columns: ['Operator', 'SIP', "Qo'ng'iroq", "O'rt. suhbat", 'Murojaat', 'Joyida hal', 'Baho'],
        rows: data.operators.map((o) => [o.fullName, o.sipExtension, o.calls, formatSeconds(o.avgTalkSeconds), o.tickets, pct(o.resolvedOnSpotPercent), o.rating]),
      },
      {
        name: 'Billing',
        columns: ["Yo'nalish", "Qo'ng'iroqlar", 'Daqiqa', "Summa (so'm)"],
        rows: [
          ...data.billing.rows.map((r) => [r.label, r.calls, r.minutes, r.amount]),
          [TARIFF_LABELS.INBOUND, data.billing.inbound.calls, data.billing.inbound.minutes, null],
          ['Jami', null, null, data.billing.total],
        ],
      },
    ]);
    await this.audit.log({
      actorId: user.id,
      action: 'report.export',
      entityType: 'Analytics',
      entityId: 'analytics',
      details: { name: 'Analitika va hisobotlar', format: 'XLSX', period: describePeriod(period) },
      ...meta,
    });
    return { fileName: `analitika-${stamp(period.to)}.xlsx`, mime: XLSX_MIME, body };
  }

  /** Shaxsiy ma'lumotli ro'yxatlar uchun mos ruxsat ham kerak (hisobotlar ruxsatining o'zi yetmaydi). */
  private assertSourceAccess(user: AuthUser, source: ReportSourceKey): void {
    if (!hasPermission(user, Permission.ReportsView)) throw new ForbiddenException("Hisobotlarni ko'rish huquqi kerak");
    if (source === 'tickets' && !hasPermission(user, Permission.TicketsRead)) throw new ForbiddenException("Murojaatlarni ko'rish huquqi kerak");
    if (source === 'calls' && !hasPermission(user, Permission.CallsRead)) throw new ForbiddenException("Qo'ng'iroqlar jurnalini ko'rish huquqi kerak");
  }

  private render(
    format: ExportFormat,
    table: { title: string; subtitle: string; columns: string[]; rows: CellValue[][]; footer: string; baseName: string },
  ): ReportFile {
    switch (format) {
      case ExportFormat.XLSX:
        return { fileName: `${table.baseName}.xlsx`, mime: XLSX_MIME, body: buildXlsx([{ name: table.title, columns: table.columns, rows: table.rows }]) };
      case ExportFormat.CSV: {
        const lines = [table.columns, ...table.rows.map((row) => row.map((v) => (v === null || v === undefined ? '' : String(v))))];
        const csv = '﻿' + lines.map((cols) => cols.map(csvCell).join(';')).join('\r\n');
        return { fileName: `${table.baseName}.csv`, mime: 'text/csv; charset=utf-8', body: Buffer.from(csv, 'utf8') };
      }
      case ExportFormat.PDF:
        return { fileName: `${table.baseName}.pdf`, mime: PDF_MIME, body: buildTablePdf(table) };
      default:
        throw new BadRequestException(`${format} formati bu hisobot uchun qo'llanmaydi`);
    }
  }

  private rows(user: AuthUser, source: ReportSourceKey, period: Period): Promise<Row[]> {
    switch (source) {
      case 'daily_summary':
        return this.dailySummary(user, period);
      case 'operators':
        return this.operators(user, period);
      case 'topics':
        return this.topics(user, period);
      case 'org_units':
        return this.orgUnits(user, period);
      case 'overdue':
        return this.overdue(user);
      case 'billing':
        return this.billing(user, period);
      case 'tickets':
        return this.tickets(user, period);
      case 'calls':
        return this.calls(user, period);
      default:
        throw new BadRequestException("Bu manba uchun hisobot yo'q");
    }
  }

  private async dailySummary(user: AuthUser, period: Period): Promise<Row[]> {
    const day: Period = { ...period, bucket: 'day' };
    const [calls, tickets, onSpot] = await Promise.all([
      this.analytics.inboundCalls(user, day),
      this.prisma.ticket.findMany({ where: this.analytics.ticketWhere(user, day), select: { createdAt: true } }),
      this.prisma.ticket.findMany({ where: this.analytics.ticketWhere(user, day, RESOLVED_ON_SPOT), select: { createdAt: true } }),
    ]);
    const countBy = (items: { createdAt: Date }[]) => items.reduce((m, t) => m.set(dayKey(t.createdAt), (m.get(dayKey(t.createdAt)) ?? 0) + 1), new Map<string, number>());
    const ticketsBy = countBy(tickets);
    const onSpotBy = countBy(onSpot);
    return this.analytics.series(calls, day).map((bucket) => {
      const kpi = this.analytics.callKpi(calls.filter((c) => dayKey(c.startedAt) === bucket.key), 0);
      return {
        Sana: `${bucket.key.slice(8, 10)}.${bucket.key.slice(5, 7)}.${bucket.key.slice(0, 4)}`,
        Kiruvchi: bucket.total,
        'Javob berildi': bucket.answered,
        Javobsiz: bucket.lost,
        "O'rt. kutish": formatSeconds(kpi.avgWaitSeconds),
        "O'rt. suhbat": formatSeconds(kpi.avgTalkSeconds),
        Murojaatlar: ticketsBy.get(bucket.key) ?? 0,
        'Joyida hal': onSpotBy.get(bucket.key) ?? 0,
      };
    });
  }

  private async operators(user: AuthUser, period: Period): Promise<Row[]> {
    return (await this.analytics.operators(user, period)).map((o) => ({
      Operator: o.fullName,
      SIP: o.sipExtension,
      "Qo'ng'iroq": o.calls,
      "O'rt. suhbat": formatSeconds(o.avgTalkSeconds),
      Murojaat: o.tickets,
      'Joyida hal': pct(o.resolvedOnSpotPercent),
      Baho: o.rating,
    }));
  }

  private async topics(user: AuthUser, period: Period): Promise<Row[]> {
    const [all, closed, overdue] = await Promise.all([
      this.analytics.topTopics(user, period),
      this.analytics.topicCounts(user, period, { status: TicketStatus.CLOSED }),
      this.analytics.topicCounts(user, period, { status: { in: OPEN }, dueAt: { lt: new Date() } }),
    ]);
    return all.map((t) => ({
      Raqam: t.number,
      Toifa: t.parent ?? t.name,
      Mavzu: t.parent ? t.name : null,
      Murojaatlar: t.count,
      Yopilgan: closed.get(t.categoryId) ?? 0,
      "Muddati o'tgan": overdue.get(t.categoryId) ?? 0,
    }));
  }

  /** Bo'linmalar kesimida ijro: davrda yaratilgan va bo'linmaga yuborilgan murojaatlar. */
  private async orgUnits(user: AuthUser, period: Period): Promise<Row[]> {
    const tickets = await this.prisma.ticket.findMany({
      where: this.analytics.ticketWhere(user, period, { assignedOrgUnitId: { not: null } }),
      select: { status: true, dueAt: true, createdAt: true, closedAt: true, assignedOrgUnit: { select: { name: true } } },
      take: ROW_LIMIT * 5,
    });
    const now = Date.now();
    const units = new Map<string, { total: number; open: number; overdue: number; closed: number; days: number[] }>();
    for (const t of tickets) {
      const name = t.assignedOrgUnit!.name;
      const u = units.get(name) ?? { total: 0, open: 0, overdue: 0, closed: 0, days: [] };
      u.total++;
      if (t.status === TicketStatus.CLOSED) {
        u.closed++;
        if (t.closedAt) u.days.push((t.closedAt.getTime() - t.createdAt.getTime()) / DAY_MS);
      } else {
        u.open++;
        if (t.dueAt && t.dueAt.getTime() < now) u.overdue++;
      }
      units.set(name, u);
    }
    return [...units.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, u]) => ({
        "Bo'linma": name,
        Jami: u.total,
        Ijroda: u.open,
        "Muddati o'tgan": u.overdue,
        Yopildi: u.closed,
        "O'rt. ijro kuni": u.days.length > 0 ? Math.round((u.days.reduce((a, b) => a + b, 0) / u.days.length) * 10) / 10 : null,
      }));
  }

  /** Hozirgi holat: muddati o'tgan va hali yopilmagan murojaatlar (davrga bog'liq emas). */
  private async overdue(user: AuthUser): Promise<Row[]> {
    const now = new Date();
    const tickets = await this.prisma.ticket.findMany({
      where: { AND: [ticketScopeWhere(user), { status: { in: OPEN }, dueAt: { lt: now } }] },
      select: { number: true, createdAt: true, subject: true, dueAt: true, assignedOrgUnit: { select: { name: true } }, assignee: { select: { fullName: true } } },
      orderBy: { dueAt: 'asc' },
      take: ROW_LIMIT,
    });
    return tickets.map((t) => ({
      Raqam: t.number,
      'Qabul qilingan': formatExportDate(t.createdAt),
      Mavzu: t.subject,
      "Bo'linma": t.assignedOrgUnit?.name ?? 'Yo\'naltirilmagan',
      Ijrochi: t.assignee?.fullName ?? null,
      'Ijro muddati': formatExportDate(t.dueAt),
      'Kechikish (kun)': Math.floor((now.getTime() - t.dueAt!.getTime()) / DAY_MS),
    }));
  }

  private async billing(user: AuthUser, period: Period): Promise<Row[]> {
    const b = await this.analytics.billing(user, period);
    return [
      ...b.rows.map((r) => ({ "Yo'nalish": r.label, "Qo'ng'iroqlar": r.calls, Daqiqa: r.minutes, "Summa (so'm)": r.amount })),
      { "Yo'nalish": TARIFF_LABELS.INBOUND, "Qo'ng'iroqlar": b.inbound.calls, Daqiqa: b.inbound.minutes, "Summa (so'm)": null },
      { "Yo'nalish": 'Jami', "Qo'ng'iroqlar": null, Daqiqa: null, "Summa (so'm)": b.total },
    ];
  }

  private async tickets(user: AuthUser, period: Period): Promise<Row[]> {
    const canSeeAnonymous = hasPermission(user, Permission.TicketsConfidential);
    const tickets = await this.prisma.ticket.findMany({
      where: this.analytics.ticketWhere(user, period),
      select: {
        number: true,
        createdAt: true,
        channel: true,
        type: true,
        status: true,
        subject: true,
        dueAt: true,
        isAnonymous: true,
        category: { select: { nameUz: true, parent: { select: { nameUz: true } } } },
        region: { select: { nameUz: true } },
        assignedOrgUnit: { select: { name: true } },
        assignee: { select: { fullName: true } },
        citizen: { select: { fullName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: ROW_LIMIT,
    });
    return tickets.map((t) => {
      const citizen = t.isAnonymous && !canSeeAnonymous ? null : t.citizen;
      return {
        Raqam: t.number,
        Sana: formatExportDate(t.createdAt),
        Kanal: CHANNEL_LABELS[t.channel],
        Fuqaro: citizen?.fullName ?? (t.isAnonymous ? 'Anonim' : null),
        Telefon: citizen ? formatExportPhone(citizen.phone) : null,
        Turi: TYPE_LABELS[t.type],
        Toifa: t.category?.parent?.nameUz ?? t.category?.nameUz ?? null,
        Mavzu: t.subject,
        Hudud: t.region?.nameUz ?? null,
        "Bo'linma": t.assignedOrgUnit?.name ?? null,
        Ijrochi: t.assignee?.fullName ?? null,
        Holat: STATUS_LABELS[t.status],
        Muddat: formatExportDate(t.dueAt),
      };
    });
  }

  private async calls(user: AuthUser, period: Period): Promise<Row[]> {
    const calls = await this.prisma.call.findMany({
      where: this.analytics.callWhere(user, period),
      select: {
        startedAt: true,
        direction: true,
        callerNumber: true,
        calledNumber: true,
        waitSeconds: true,
        talkSeconds: true,
        result: true,
        queue: { select: { name: true } },
        agent: { select: { fullName: true } },
        ticket: { select: { number: true } },
        charge: { select: { amount: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: ROW_LIMIT,
    });
    return calls.map((c) => ({
      Vaqt: formatExportDate(c.startedAt),
      "Yo'nalish": DIRECTION_LABELS[c.direction],
      Raqam: formatExportPhone(c.direction === CallDirection.OUTBOUND ? c.calledNumber : c.callerNumber),
      Navbat: c.queue?.name ?? null,
      Operator: c.agent?.fullName ?? null,
      Kutish: formatSeconds(c.waitSeconds),
      Suhbat: formatSeconds(c.talkSeconds),
      Natija: c.result ? CALL_RESULT_LABELS[c.result] : null,
      Murojaat: c.ticket?.number ?? null,
      "Narx (so'm)": c.charge ? Number(c.charge.amount) : null,
    }));
  }
}

