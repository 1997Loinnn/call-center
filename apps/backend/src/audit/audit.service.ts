import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Page, pageArgs, RequestMeta } from '../common/http';
import { PrismaService } from '../prisma/prisma.service';
import { AuditQueryDto } from './audit.dto';

export interface AuditEntry extends RequestMeta {
  actorId?: number | null;
  action: string;
  entityType?: string;
  entityId?: string | number;
  details?: Prisma.InputJsonValue;
}

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

  async list(query: AuditQueryDto): Promise<Page<unknown>> {
    const where: Prisma.AuditLogWhereInput = {
      actorId: query.actorId,
      action: query.action ? { startsWith: query.action } : undefined,
      createdAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { id: 'desc' },
        include: { actor: { select: { id: true, username: true, fullName: true } } },
        ...pageArgs(query),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
