import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { pageArgs, RequestMeta } from '../common/http';
import { maskPhone } from '../common/phone';
import { buildXlsx } from '../common/xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { formatExportDate } from '../tickets/ticket-export';
import { ACTION_LABELS, browserOf, categoryOf, categoryWhere, changesOf, summaryOf, toneOf } from './audit-presenter';
import { AuditQueryDto } from './audit.dto';

export interface AuditEntry extends RequestMeta {
  actorId?: number | null;
  action: string;
  entityType?: string;
  entityId?: string | number;
  details?: Prisma.InputJsonValue;
}

const ACTOR_SELECT = {
  select: {
    id: true,
    username: true,
    fullName: true,
    orgUnit: { select: { name: true, shortName: true } },
    roles: { select: { role: { select: { name: true } } } },
  },
} satisfies Prisma.UserDefaultArgs;

type AuditRow = Prisma.AuditLogGetPayload<{ include: { actor: typeof ACTOR_SELECT } }>;

/** Bitta eksportdagi eng ko'p yozuv. */
const EXPORT_LIMIT = 10_000;

/**
 * Audit jurnali (TZ 9-bo'lim): kirish, fuqaro kartasini ko'rish, yozuvni tinglash,
 * o'zgartirish va eksport. Jadvalga faqat yozuv qo'shiladi.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId === undefined ? undefined : String(entry.entityId),
          details: entry.details,
          ip: entry.ip,
          userAgent: entry.userAgent,
        },
      });
    } catch (err) {
      // Audit yozilmasa asosiy amal to'xtamaydi, lekin xato albatta logga tushadi
      this.logger.error(`Audit yozuvi saqlanmadi: ${entry.action}`, err instanceof Error ? err.stack : String(err));
    }
  }

  async list(query: AuditQueryDto) {
    const where = this.where(query);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [rows, total, todayTotal] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, include: { actor: ACTOR_SELECT }, ...pageArgs(query) }),
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
    ]);
    return { items: await this.present(rows), total, page: query.page, pageSize: query.pageSize, todayTotal };
  }

  actors(search?: string) {
    const q = search?.trim().slice(0, 100);
    return this.prisma.user.findMany({
      where: q ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }] } : undefined,
      select: { id: true, username: true, fullName: true },
      orderBy: { fullName: 'asc' },
      take: 20,
    });
  }

  /** Filtrlangan yozuvlar XLSX faylda (ko'pi bilan EXPORT_LIMIT); eksportning o'zi ham jurnalga yoziladi. */
  async exportXlsx(user: AuthUser, query: AuditQueryDto, meta: RequestMeta): Promise<Buffer> {
    const rows = await this.prisma.auditLog.findMany({ where: this.where(query), orderBy: { id: 'desc' }, include: { actor: ACTOR_SELECT }, take: EXPORT_LIMIT });
    const items = await this.present(rows);
    await this.log({ actorId: user.id, action: 'audit.export', entityType: 'AuditLog', entityId: 'list', details: { rows: items.length }, ...meta });
    return buildXlsx([
      {
        name: 'Audit jurnali',
        columns: ['Vaqt', 'Foydalanuvchi', "Rol va bo'linma", 'Amal', 'Obyekt', 'Tafsilot', 'IP', 'Brauzer'],
        rows: items.map((i) => [formatExportDate(i.createdAt), i.actorName, i.actorSub, i.label, i.object, i.summary, i.ip, i.browser]),
      },
    ]);
  }

  private where(query: AuditQueryDto): Prisma.AuditLogWhereInput {
    const and: Prisma.AuditLogWhereInput[] = [
      {
        actorId: query.actorId,
        action: query.action ? { startsWith: query.action } : undefined,
        createdAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
      },
    ];
    if (query.category) and.push(categoryWhere(query.category));
    if (query.search) {
      const q = query.search.trim();
      and.push({
        OR: [
          { actor: { fullName: { contains: q, mode: 'insensitive' } } },
          { actor: { username: { contains: q, mode: 'insensitive' } } },
          { entityId: { contains: q } },
          { ip: { startsWith: q } },
          { action: { contains: q } },
        ],
      });
    }
    return { AND: and };
  }

  /** Jadval uchun: amal nomi, foydalanuvchi roli va bo'linmasi, obyekt nomi, qisqa tavsif va o'zgarishlar. */
  private async present(rows: AuditRow[]) {
    const ids = (type: string) => [...new Set(rows.filter((r) => r.entityType === type && /^\d+$/.test(r.entityId ?? '')).map((r) => Number(r.entityId)))];
    const [tickets, users, roles, citizens, calls, categories, units] = await Promise.all([
      this.prisma.ticket.findMany({ where: { id: { in: ids('Ticket') } }, select: { id: true, number: true } }),
      this.prisma.user.findMany({ where: { id: { in: ids('User') } }, select: { id: true, username: true } }),
      this.prisma.role.findMany({ where: { id: { in: ids('Role') } }, select: { id: true, name: true } }),
      this.prisma.citizen.findMany({ where: { id: { in: ids('Citizen') } }, select: { id: true, phone: true } }),
      this.prisma.call.findMany({ where: { id: { in: ids('Call') } }, select: { id: true, startedAt: true } }),
      this.prisma.category.findMany({ where: { id: { in: ids('Category') } }, select: { id: true, nameUz: true } }),
      this.prisma.orgUnit.findMany({ where: { id: { in: ids('OrgUnit') } }, select: { id: true, name: true } }),
    ]);
    const names = {
      Ticket: new Map(tickets.map((t) => [String(t.id), t.number])),
      User: new Map(users.map((u) => [String(u.id), u.username])),
      Role: new Map(roles.map((r) => [String(r.id), r.name])),
      Citizen: new Map(citizens.map((c) => [String(c.id), maskPhone(c.phone)])),
      Call: new Map(calls.map((c) => [String(c.id), formatExportDate(c.startedAt)])),
      Category: new Map(categories.map((c) => [String(c.id), c.nameUz])),
      OrgUnit: new Map(units.map((u) => [String(u.id), u.name])),
    } as Record<string, Map<string, string>>;

    return rows.map((row) => {
      const details = (row.details && typeof row.details === 'object' && !Array.isArray(row.details) ? row.details : {}) as Record<string, unknown>;
      const changes = changesOf(row.action, row.details);
      const name = row.entityId ? names[row.entityType ?? '']?.get(row.entityId) : undefined;
      return {
        id: row.id,
        createdAt: row.createdAt,
        action: row.action,
        label: ACTION_LABELS[row.action] ?? row.action,
        category: categoryOf(row.action),
        tone: toneOf(row.action),
        actorId: row.actor?.id ?? null,
        actorName: row.actor?.fullName ?? (row.action === 'auth.login_failed' && details.username ? String(details.username) : 'Tizim'),
        actorSub: row.actor
          ? [row.actor.roles.map((r) => r.role.name).join(', '), row.actor.orgUnit.shortName ?? row.actor.orgUnit.name].filter(Boolean).join(' · ')
          : row.action.startsWith('auth.')
            ? 'Login'
            : 'Avtomatik',
        object: this.objectOf(row, details, name),
        summary: summaryOf(row.action, row.details, changes),
        changes,
        ip: row.ip,
        browser: browserOf(row.userAgent),
        details: row.details,
      };
    });
  }

  /** Obyektning odam o'qiydigan nomi: "Murojaat 1097-2026-000123", "Rol «Supervisor»" va h.k. */
  private objectOf(row: AuditRow, d: Record<string, unknown>, name: string | undefined): string {
    const named = (title: string, value: unknown) => (value ? `${title} «${String(value)}»` : title);
    switch (row.entityType) {
      case 'Ticket':
        return row.entityId === 'list' ? "Murojaatlar ro'yxati" : `Murojaat ${name ?? String(d.number ?? `#${row.entityId}`)}`;
      case 'User':
        return `Foydalanuvchi ${name ?? String(d.username ?? d.agent ?? `#${row.entityId}`)}`;
      case 'Role':
        return named('Rol', name ?? d.code);
      case 'Citizen':
        return `Fuqaro kartasi (${name ?? maskPhone(row.entityId ?? '')})`;
      case 'Call':
        if (row.entityId === 'list') return "Qo'ng'iroqlar jurnali";
        return name ? `Qo'ng'iroq yozuvi · ${name}` : `Qo'ng'iroq yozuvi #${row.entityId}`;
      case 'Category':
        return named(d.topic ? 'Mavzu' : 'Toifa', name ?? d.nameUz);
      case 'RoutingRule':
        return `Yo'naltirish qoidasi${d.target ? ` → ${String(d.target)}` : ''}`;
      case 'ExportTemplate':
        return named('Eksport shabloni', d.name);
      case 'AlertRule':
        return named('Ogohlantirish limiti', d.name);
      case 'Alert':
        return `Ogohlantirish #${row.entityId}`;
      case 'Campaign':
        return named('Kampaniya', d.name);
      case 'OrgUnit':
        return named("Bo'linma", name ?? d.code);
      case 'Setting':
        return named('Sozlama', d.name ?? row.entityId);
      case 'Analytics':
        return 'Analitika va hisobotlar';
      case 'AuditLog':
        return 'Audit jurnali';
      case 'TicketTask':
        return `Murojaat ${String(d.number ?? '')} vazifasi`;
      default:
        return row.action === 'auth.login_failed' && d.username ? `Hisob «${String(d.username)}»` : 'Tizim';
    }
  }
}
