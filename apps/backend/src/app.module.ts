import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CallsModule } from './calls/calls.module';
import { CitizensModule } from './citizens/citizens.module';
import { HttpThrottlerGuard, JwtAuthGuard, PermissionsGuard } from './common/guards';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { OrgUnitsModule } from './org-units/org-units.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ReferenceModule } from './reference/reference.module';
import { ReportsModule } from './reports/reports.module';
import { TelephonyModule } from './telephony/telephony.module';
import { TicketsModule } from './tickets/tickets.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    RealtimeModule,
    UsersModule,
    OrgUnitsModule,
    ReferenceModule,
    CitizensModule,
    TicketsModule,
    CallsModule,
    TelephonyModule,
    ReportsModule,
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
