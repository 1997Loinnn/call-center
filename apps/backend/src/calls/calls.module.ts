import { Controller, Get, Injectable, Module, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CallDirection, CallResult, Prisma } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from '../common/auth-user';
import { callScopeWhere } from '../common/data-scope';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PageQueryDto, pageArgs, RequestMeta, requestMeta } from '../common/http';
import { buildXlsx, XLSX_MIME } from '../common/xlsx';
import { AuditService } from '../audit/audit.service';
import { formatExportDate, formatExportPhone } from '../tickets/ticket-export';
import type { Request, Response } from 'express';
import { Permission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';

export class CallsQueryDto extends PageQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  agentId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  number?: string;

  @IsOptional()
  @IsEnum(CallResult)
  result?: CallResult;

  @IsOptional()
  @IsEnum(CallDirection)
  direction?: CallDirection;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  queueId?: number;

  /** Javobsiz va uzilgan: navbatda uzdi, javob berilmadi, band, xato */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  lost?: boolean;
}

const LOST_RESULTS: CallResult[] = [CallResult.ABANDONED, CallResult.NO_ANSWER, CallResult.BUSY, CallResult.FAILED];
const EXPORT_LIMIT = 20_000;
const RESULT_LABELS: Record<CallResult, string> = {
  ANSWERED: 'Javob berildi',
  ABANDONED: 'Kutib uzildi',
  NO_ANSWER: 'Javobsiz',
  BUSY: 'Band',
  FAILED: 'Xato',
  IVR_ONLY: 'IVR da yakunlandi',
  VOICEMAIL: 'Ovozli xabar',
};
const DIRECTION_LABELS: Record<CallDirection, string> = { INBOUND: 'Kiruvchi', OUTBOUND: 'Chiquvchi', INTERNAL: 'Ichki' };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** withOutcome=false: yig'indi ko'rsatkichlar uchun (yo'nalish va natija tanloviga bog'liq emas). */
  private where(user: AuthUser, query: CallsQueryDto, withOutcome = true): Prisma.CallWhereInput {
    return {
      AND: [
        callScopeWhere(user),
        {
          agentId: query.agentId,
          queueId: query.queueId,
          startedAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
          OR: query.number
            ? [{ callerNumber: { contains: query.number } }, { calledNumber: { contains: query.number } }]
            : undefined,
        },
        withOutcome ? { result: query.lost ? { in: LOST_RESULTS } : query.result, direction: query.direction } : {},
      ],
    };
  }

  /** Jurnal tepasidagi yig'indi: kiruvchi natijalar bo'yicha, chiquvchilar soni va xarajati. */
  async summary(user: AuthUser, query: CallsQueryDto) {
    const where = this.where(user, query, false);
    const [groups, wait, talk, cost] = await Promise.all([
      this.prisma.call.groupBy({ by: ['direction', 'result'], where, _count: { _all: true } }),
      this.prisma.call.aggregate({ where: { AND: [where, { direction: CallDirection.INBOUND }] }, _avg: { waitSeconds: true } }),
      this.prisma.call.aggregate({ where: { AND: [where, { result: CallResult.ANSWERED }] }, _avg: { talkSeconds: true } }),
      this.prisma.callCharge.aggregate({ where: { call: where }, _sum: { amount: true } }),
    ]);
    const inbound: Partial<Record<CallResult, number>> = {};
    let inboundTotal = 0;
    let outboundTotal = 0;
    for (const g of groups) {
      if (g.direction === CallDirection.INBOUND) {
        inboundTotal += g._count._all;
        if (g.result) inbound[g.result] = (inbound[g.result] ?? 0) + g._count._all;
      } else if (g.direction === CallDirection.OUTBOUND) {
        outboundTotal += g._count._all;
      }
    }
    return {
      inbound: { total: inboundTotal, byResult: inbound },
      outbound: { total: outboundTotal, cost: cost._sum.amount?.toString() ?? '0' },
      avgWaitSeconds: Math.round(wait._avg.waitSeconds ?? 0),
      avgTalkSeconds: Math.round(talk._avg.talkSeconds ?? 0),
    };
  }

  /** Joriy filtr bo'yicha jurnal XLSX faylda (ko'pi bilan EXPORT_LIMIT qator); raqamlar chiqadi — audit jurnaliga yoziladi. */
  async exportXlsx(user: AuthUser, query: CallsQueryDto, meta: RequestMeta): Promise<Buffer> {
    const calls = await this.prisma.call.findMany({
      where: this.where(user, query),
      include: {
        agent: { select: { fullName: true } },
        queue: { select: { name: true } },
        ticket: { select: { number: true } },
        charge: { select: { amount: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: EXPORT_LIMIT,
    });
    await this.audit.log({
      actorId: user.id,
      action: 'calls.export',
      entityType: 'Call',
      entityId: 'list',
      details: { rows: calls.length, filters: { ...query, page: undefined, pageSize: undefined } } as never,
      ...meta,
    });
    return buildXlsx([
      {
        name: "Qo'ng'iroqlar jurnali",
        columns: ['Vaqt', "Yo'nalish", 'Raqam', 'Navbat', 'Operator', 'Kutish', 'Suhbat', 'Natija', 'Murojaat', "Narx (so'm)"],
        rows: calls.map((c) => [
          formatExportDate(c.startedAt),
          DIRECTION_LABELS[c.direction],
          formatExportPhone(c.direction === CallDirection.OUTBOUND ? c.calledNumber : c.callerNumber),
          c.queue?.name ?? null,
          c.agent?.fullName ?? null,
          mmss(c.waitSeconds),
          mmss(c.talkSeconds),
          c.result ? RESULT_LABELS[c.result] : null,
          c.ticket?.number ?? null,
          c.charge ? Number(c.charge.amount) : null,
        ]),
      },
    ]);
  }

  async list(user: AuthUser, query: CallsQueryDto) {
    const where = this.where(user, query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.call.findMany({
        where,
        include: {
          agent: { select: { id: true, fullName: true } },
          queue: { select: { id: true, name: true } },
          ticket: { select: { id: true, number: true } },
          recording: { select: { id: true, durationSeconds: true, deletedAt: true, legalHold: true, retainUntil: true } },
          qaEvaluations: { select: { score: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          charge: { select: { amount: true } },
        },
        orderBy: { startedAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.call.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}

@ApiTags('calls')
@Controller('calls')
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Get()
  @RequirePermissions(Permission.CallsRead)
  list(@CurrentUser() user: AuthUser, @Query() query: CallsQueryDto) {
    return this.calls.list(user, query);
  }

  @Get('export')
  @RequirePermissions(Permission.CallsRead)
  async export(@CurrentUser() user: AuthUser, @Query() query: CallsQueryDto, @Req() req: Request, @Res() res: Response) {
    const body = await this.calls.exportXlsx(user, query, requestMeta(req));
    res.set({
      'Content-Type': XLSX_MIME,
      'Content-Length': String(body.length),
      'Content-Disposition': `attachment; filename="qongiroqlar-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      'Cache-Control': 'no-store',
    });
    res.send(body);
  }

  @Get('summary')
  @RequirePermissions(Permission.CallsRead)
  summary(@CurrentUser() user: AuthUser, @Query() query: CallsQueryDto) {
    return this.calls.summary(user, query);
  }
}

@Module({
  controllers: [CallsController],
  providers: [CallsService],
})
export class CallsModule {}
