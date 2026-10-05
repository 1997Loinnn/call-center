import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './ai/ai.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CallsModule } from './calls/calls.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CitizensModule } from './citizens/citizens.module';
import { CrmModule } from './crm/crm.module';
import { HttpThrottlerGuard, JwtAuthGuard, PermissionsGuard } from './common/guards';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { IvrModule } from './ivr/ivr.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { QaModule } from './qa/qa.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { OmniModule } from './omni/omni.module';
import { OrgUnitsModule } from './org-units/org-units.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RecordingsModule } from './recordings/recordings.module';
import { ReferenceModule } from './reference/reference.module';
import { ReportsModule } from './reports/reports.module';
import { RolesModule } from './roles/roles.module';
import { SettingsModule } from './settings/settings.service';
import { SystemSettingsModule } from './settings/system-settings';
import { TelephonyModule } from './telephony/telephony.module';
import { TicketsModule } from './tickets/tickets.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    PrismaModule,
    SettingsModule,
    AuditModule,
    AuthModule,
    RealtimeModule,
    IntegrationsModule,
    AiModule,
    UsersModule,
    RolesModule,
    OrgUnitsModule,
    ReferenceModule,
    CitizensModule,
    TicketsModule,
    CrmModule,
    SystemSettingsModule,
    CallsModule,
    RecordingsModule,
    TelephonyModule,
    IvrModule,
    KnowledgeModule,
    QaModule,
    OmniModule,
    CampaignsModule,
    ReportsModule,
    MonitoringModule,
    HealthModule,
  ],
  providers: [
    // Tartib muhim: avval so'rovlar chegarasi, keyin autentifikatsiya, keyin ruxsatlar
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
