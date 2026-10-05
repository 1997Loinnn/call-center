import { Controller, Get, Inject, Injectable, Module, Param, ParseIntPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CallDirection, CallResult, Prisma, TicketStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { callScopeWhere, ticketScopeWhere } from '../common/data-scope';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { requestMeta } from '../common/http';
import { customRange, startOfDay } from '../common/period';
import { Permission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { PBX_ADAPTER, PbxAdapter } from '../telephony/pbx-adapter';
import { TelephonyModule } from '../telephony/telephony.module';
import { AnalyticsService } from './analytics.service';
import { ReportExportService, ReportFile } from './report-export.service';
import { PeriodQueryDto } from './reports.dto';
import { ScheduledReportsService } from './scheduled-reports.service';

/** Rahbariyat dashboardi va yuqori paneldagi bugungi ko'rsatkichlar (F-REP-06). */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PBX_ADAPTER) private readonly pbx: PbxAdapter,
  ) {}

  async summary(user: AuthUser) {
    const ticketScope = ticketScopeWhere(user);
    const todayCalls: Prisma.CallWhereInput = { AND: [callScopeWhere(user), { startedAt: { gte: startOfDay(new Date()) } }] };
    const todayInbound: Prisma.CallWhereInput = { AND: [todayCalls, { direction: CallDirection.INBOUND }] };

    const [byStatus, overdue, createdToday, callsToday, answeredToday, abandonedToday, waitAvg, talkAvg, byRegion, queues] =
      await Promise.all([
        this.prisma.ticket.groupBy({ by: ['status'], where: ticketScope, _count: { _all: true } }),
        this.prisma.ticket.count({
          where: { AND: [ticketScope, { dueAt: { lt: new Date() }, status: { not: TicketStatus.CLOSED } }] },
        }),
        this.prisma.ticket.count({ where: { AND: [ticketScope, { createdAt: { gte: startOfDay(new Date()) } }] } }),
        this.prisma.call.count({ where: todayInbound }),
        this.prisma.call.count({ where: { AND: [todayInbound, { result: CallResult.ANSWERED }] } }),
        this.prisma.call.count({ where: { AND: [todayInbound, { result: { in: [CallResult.ABANDONED, CallResult.NO_ANSWER] } }] } }),
        this.prisma.call.aggregate({ where: { AND: [todayInbound, { result: CallResult.ANSWERED }] }, _avg: { waitSeconds: true } }),
        this.prisma.call.aggregate({ where: { AND: [todayCalls, { result: CallResult.ANSWERED }] }, _avg: { talkSeconds: true } }),
        this.prisma.ticket.groupBy({
          by: ['regionId'],
          where: { AND: [ticketScope, { regionId: { not: null } }] },
          _count: { _all: true },
        }),
        this.pbx.queueSnapshot().catch(() => null),
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
      // Kiruvchi qo'ng'iroqlar: jami, javob berilgan, uzilgan/javobsiz; o'rtacha suhbat barcha javob berilganlar bo'yicha
      callsToday: {
        total: callsToday,
        answered: answeredToday,
        abandoned: abandonedToday,
        avgWaitSeconds: Math.round(waitAvg._avg.waitSeconds ?? 0),
        avgTalkSeconds: Math.round(talkAvg._avg.talkSeconds ?? 0),
        // Hozir navbatda kutayotganlar (PBX bermasa — null)
        waiting: queues ? queues.reduce((sum, q) => sum + q.callers.length, 0) : null,
      },
    };
  }
}

function sendFile(res: Response, file: ReportFile): void {
  const ascii = file.fileName.replace(/[^\w.-]/g, '_');
  res.set({
    'Content-Type': file.mime,
    'Content-Length': String(file.body.length),
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    'Cache-Control': 'no-store',
  });
  res.send(file.body);
}

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly analytics: AnalyticsService,
    private readonly exports: ReportExportService,
    private readonly scheduled: ScheduledReportsService,
  ) {}

  @Get('summary')
  @RequirePermissions(Permission.ReportsView)
  summary(@CurrentUser() user: AuthUser) {
    return this.reports.summary(user);
  }

  @Get('analytics')
  @RequirePermissions(Permission.ReportsView)
  analyticsData(@CurrentUser() user: AuthUser, @Query() query: PeriodQueryDto) {
    return this.analytics.analytics(user, customRange(query.from, query.to, query.period ?? '7d'));
  }

  @Get('analytics/export')
  @RequirePermissions(Permission.ReportsView)
  async analyticsExport(@CurrentUser() user: AuthUser, @Query() query: PeriodQueryDto, @Req() req: Request, @Res() res: Response) {
    sendFile(res, await this.exports.analyticsWorkbook(user, customRange(query.from, query.to, query.period ?? '7d'), requestMeta(req)));
  }

  @Get('templates/:id/download')
  @RequirePermissions(Permission.ReportsView)
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PeriodQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    sendFile(res, await this.exports.downloadTemplate(user, id, query, requestMeta(req)));
  }

  /** Jadvalni kutmasdan qabul qiluvchilarga emailga yuborish (sinov yoki qayta yuborish). */
  @Post('templates/:id/send')
  @RequirePermissions(Permission.SettingsManage)
  send(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.scheduled.sendNow(user, id);
  }
}

@Module({
  imports: [TelephonyModule],
  controllers: [ReportsController],
  providers: [ReportsService, AnalyticsService, ReportExportService, ScheduledReportsService],
  exports: [AnalyticsService],
})
export class ReportsModule {}
