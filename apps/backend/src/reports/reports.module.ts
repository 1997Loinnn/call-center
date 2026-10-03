import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CallResult, Prisma, TicketStatus } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { callScopeWhere, ticketScopeWhere } from '../common/data-scope';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { Permission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';

const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Rahbariyat dashboardi uchun qisqa ko'rsatkichlar (F-REP-06). Batafsil hisobotlar keyingi bosqichda. */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: AuthUser) {
    const ticketScope = ticketScopeWhere(user);
    const todayCalls: Prisma.CallWhereInput = { AND: [callScopeWhere(user), { startedAt: { gte: startOfToday() } }] };

    const [byStatus, overdue, createdToday, callsToday, answeredToday, abandonedToday, waitAvg, byRegion] =
      await Promise.all([
        this.prisma.ticket.groupBy({ by: ['status'], where: ticketScope, _count: { _all: true } }),
        this.prisma.ticket.count({
          where: { AND: [ticketScope, { dueAt: { lt: new Date() }, status: { not: TicketStatus.CLOSED } }] },
        }),
        this.prisma.ticket.count({ where: { AND: [ticketScope, { createdAt: { gte: startOfToday() } }] } }),
        this.prisma.call.count({ where: todayCalls }),
        this.prisma.call.count({ where: { AND: [todayCalls, { result: CallResult.ANSWERED }] } }),
        this.prisma.call.count({ where: { AND: [todayCalls, { result: CallResult.ABANDONED }] } }),
        this.prisma.call.aggregate({
          where: { AND: [todayCalls, { result: CallResult.ANSWERED }] },
          _avg: { waitSeconds: true },
        }),
        this.prisma.ticket.groupBy({
          by: ['regionId'],
          where: { AND: [ticketScope, { regionId: { not: null } }] },
          _count: { _all: true },
        }),
      ]);

    const regions = await this.prisma.region.findMany({ select: { id: true, nameUz: true } });
    const regionName = new Map(regions.map((r) => [r.id, r.nameUz]));

    return {
      tickets: {
        byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
        overdue,
        createdToday,
        byRegion: byRegion
          .map((row) => ({ regionId: row.regionId, region: regionName.get(row.regionId ?? -1) ?? '—', count: row._count._all }))
          .sort((a, b) => b.count - a.count),
      },
      callsToday: {
        total: callsToday,
        answered: answeredToday,
        abandoned: abandonedToday,
        avgWaitSeconds: Math.round(waitAvg._avg.waitSeconds ?? 0),
      },
    };
  }
}

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @RequirePermissions(Permission.ReportsView)
  summary(@CurrentUser() user: AuthUser) {
    return this.reports.summary(user);
  }
}

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
