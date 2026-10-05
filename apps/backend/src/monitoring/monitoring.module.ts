import { Body, Controller, Get, HttpCode, Module, Param, ParseIntPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { requestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import { RealtimeModule } from '../realtime/realtime.module';
import { ReportsModule } from '../reports/reports.module';
import { TelephonyModule } from '../telephony/telephony.module';
import { AlertsService } from './alerts.service';
import { AlertSettingsDto, AlertsQueryDto, LiveQueryDto } from './monitoring.dto';
import { MonitoringService } from './monitoring.service';

/** Boshqaruv markazi → Jonli holat. */
@ApiTags('monitoring')
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get('live')
  @RequirePermissions(Permission.MonitoringView)
  live(@CurrentUser() user: AuthUser, @Query() query: LiveQueryDto) {
    return this.monitoring.live(user, query.queue);
  }

  /** Supervisor telefonida operator suhbatini tinglash (ChanSpy) */
  @Post('agents/:id/listen')
  @HttpCode(204)
  @RequirePermissions(Permission.MonitoringView, Permission.TelephonyUse)
  listen(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.monitoring.listen(user, id, requestMeta(req));
  }
}

/** Boshqaruv markazi → Ogohlantirishlar. */
@ApiTags('alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @RequirePermissions(Permission.MonitoringView)
  list(@Query() query: AlertsQueryDto) {
    return this.alerts.list(query);
  }

  @Get('counts')
  @RequirePermissions(Permission.MonitoringView)
  counts() {
    return this.alerts.counts();
  }

  @Get('settings')
  @RequirePermissions(Permission.MonitoringView)
  settings() {
    return this.alerts.getSettings();
  }

  @Put('settings')
  @RequirePermissions(Permission.MonitoringView)
  saveSettings(@CurrentUser() user: AuthUser, @Body() dto: AlertSettingsDto) {
    return this.alerts.saveSettings(user, dto);
  }

  @Post(':id/acknowledge')
  @RequirePermissions(Permission.MonitoringView)
  acknowledge(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.alerts.acknowledge(user, id);
  }

  @Post(':id/resolve')
  @RequirePermissions(Permission.MonitoringView)
  resolve(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.alerts.resolve(user, id);
  }
}

@Module({
  imports: [TelephonyModule, RealtimeModule, ReportsModule],
  controllers: [MonitoringController, AlertsController],
  providers: [MonitoringService, AlertsService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
