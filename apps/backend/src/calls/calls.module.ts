import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CallDirection, CallResult, Prisma } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from '../common/auth-user';
import { callScopeWhere } from '../common/data-scope';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PageQueryDto, pageArgs } from '../common/http';
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

@Injectable()
export class CallsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async list(user: AuthUser, query: CallsQueryDto) {
    const where = this.where(user, query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.call.findMany({
        where,
        include: {
          agent: { select: { id: true, fullName: true } },
          queue: { select: { id: true, name: true } },
          ticket: { select: { id: true, number: true } },
          recording: { select: { id: true, durationSeconds: true, deletedAt: true } },
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
