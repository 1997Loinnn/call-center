import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDate, IsInt, IsNotEmpty, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { Permission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { EmailChannel, TelegramBot } from '../integrations/channels';
import { NotificationsService } from '../integrations/notifications.service';
import { SmsService } from '../integrations/sms';
import { TelephonyModule } from '../telephony/telephony.module';
import { TelephonyService } from '../telephony/telephony.service';
import { SettingsMap, SettingsService } from './settings.service';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

class LunchDto {
  @Matches(TIME)
  start: string;

  @Matches(TIME)
  end: string;
}

class WorkingHoursDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  days: number[];

  @Matches(TIME, { message: 'Vaqt HH:mm ko\'rinishida' })
  start: string;

  @Matches(TIME, { message: 'Vaqt HH:mm ko\'rinishida' })
  end: string;

  @ValidateNested()
  @Type(() => LunchDto)
  lunch: LunchDto;
}

class ServiceLevelDto {
  @IsInt()
  @Min(5)
  @Max(600)
  answerWithinSeconds: number;

  @IsInt()
  @Min(1)
  @Max(100)
  targetPercent: number;

  @IsInt()
  @Min(5)
  @Max(3600)
  avgWaitTargetSeconds: number;
}

class SmsTemplatesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(480)
  ticket_created: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(480)
  ticket_closed: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(480)
  callback: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(480)
  document_ready: string;
}

class SecurityDto {
  @IsBoolean()
  enforceTwoFactor: boolean;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  twoFactorRoles: string[];
}

class StaffNotifyDto {
  @IsBoolean()
  email: boolean;
}

export class SystemSettingsDto {
  @ValidateNested()
  @Type(() => WorkingHoursDto)
  workingHours: WorkingHoursDto;

  @ValidateNested()
  @Type(() => ServiceLevelDto)
  serviceLevel: ServiceLevelDto;

  /** Yozuvlarni saqlash muddati, kun (TZ: 3 oy) */
  @IsInt()
  @Min(7)
  @Max(3650)
  recordingRetentionDays: number;

  /** Ijro muddatiga necha kun qolganda eslatiladi */
  @IsInt()
  @Min(1)
  @Max(30)
  slaReminderDays: number;

  @ValidateNested()
  @Type(() => SmsTemplatesDto)
  smsTemplates: SmsTemplatesDto;

  @ValidateNested()
  @Type(() => SecurityDto)
  security: SecurityDto;

  @ValidateNested()
  @Type(() => StaffNotifyDto)
  staffNotify: StaffNotifyDto;
}

export class HolidayDto {
  @Type(() => Date)
  @IsDate()
  date: Date;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;
}

const LABELS: Record<string, string> = {
  working_hours: 'Ish vaqti',
  service_level: 'Xizmat darajasi maqsadlari',
  recording_retention_days: 'Yozuvlarni saqlash muddati',
  ticket_sla_reminder_days: 'Ijro muddati eslatmasi',
  sms_templates: 'SMS shablonlari',
  security: 'Kirish xavfsizligi',
  staff_notify: 'Xodimlarga bildirishnomalar',
};

/** Tizim → Sozlamalar (F-ADM-01..04): ish vaqti, bayramlar, saqlash muddatlari, SLA maqsadlari, SMS shablonlari. */
@Injectable()
export class SystemSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly telephony: TelephonyService,
    private readonly config: ConfigService,
    private readonly telegram: TelegramBot,
    private readonly email: EmailChannel,
    private readonly sms: SmsService,
    private readonly notifications: NotificationsService,
  ) {}

  async get() {
    const [workingHours, serviceLevel, recordingRetentionDays, slaReminderDays, smsTemplates, holidays, security, staffNotify, roles] = await Promise.all([
      this.settings.get('working_hours'),
      this.settings.get('service_level'),
      this.settings.get('recording_retention_days'),
      this.settings.get('ticket_sla_reminder_days'),
      this.settings.get('sms_templates'),
      this.prisma.holiday.findMany({ orderBy: { date: 'asc' } }),
      this.settings.get('security'),
      this.settings.get('staff_notify'),
      this.prisma.role.findMany({ select: { code: true, name: true }, orderBy: { id: 'asc' } }),
    ]);
    return {
      workingHours,
      serviceLevel,
      recordingRetentionDays,
      slaReminderDays,
      smsTemplates,
      holidays,
      security,
      staffNotify,
      roles,
      integrations: this.integrations(),
    };
  }

  async save(user: AuthUser, dto: SystemSettingsDto) {
    if (dto.workingHours.start >= dto.workingHours.end) throw new BadRequestException("Ish vaqti tugashi boshlanishidan keyin bo'lishi kerak");
    const updates: { [K in keyof SettingsMap]?: SettingsMap[K] } = {
      working_hours: dto.workingHours,
      service_level: dto.serviceLevel,
      recording_retention_days: dto.recordingRetentionDays,
      ticket_sla_reminder_days: dto.slaReminderDays,
      sms_templates: dto.smsTemplates,
      security: dto.security,
      staff_notify: dto.staffNotify,
    };
    for (const [key, value] of Object.entries(updates) as [keyof SettingsMap, never][]) {
      const before = await this.settings.get(key);
      if (JSON.stringify(before) === JSON.stringify(value)) continue;
      await this.settings.set(key, value, user.id);
      await this.audit.log({
        actorId: user.id,
        action: 'settings.update',
        entityType: 'Setting',
        entityId: key,
        details: { name: LABELS[key] ?? key, changes: this.diff(before, value) } as unknown as Prisma.InputJsonValue,
      });
    }
    return this.get();
  }

  async addHoliday(user: AuthUser, dto: HolidayDto) {
    const date = new Date(Date.UTC(dto.date.getFullYear(), dto.date.getMonth(), dto.date.getDate()));
    if (await this.prisma.holiday.findUnique({ where: { date } })) throw new ConflictException('Bu sana allaqachon bayram sifatida kiritilgan');
    const holiday = await this.prisma.holiday.create({ data: { date, name: dto.name.trim() } });
    await this.audit.log({ actorId: user.id, action: 'settings.update', entityType: 'Setting', entityId: 'holidays', details: { name: 'Bayram kunlari', changes: { [holiday.date.toISOString().slice(0, 10)]: { from: null, to: holiday.name } } } });
    return holiday;
  }

  async removeHoliday(user: AuthUser, id: number): Promise<void> {
    const holiday = await this.prisma.holiday.findUnique({ where: { id } });
    if (!holiday) throw new NotFoundException('Bayram topilmadi');
    await this.prisma.holiday.delete({ where: { id } });
    await this.audit.log({ actorId: user.id, action: 'settings.update', entityType: 'Setting', entityId: 'holidays', details: { name: 'Bayram kunlari', changes: { [holiday.date.toISOString().slice(0, 10)]: { from: holiday.name, to: null } } } });
  }

  /** Integratsiyalar holati (F-ADM-04): PBX, arxiv, SMS shlyuzi, pochta va Telegram bot. */
  private integrations() {
    const pbx = this.telephony.driver;
    const tg = this.telegram.state();
    const mail = this.email.state();
    const sms = this.sms.status();
    const inbound = mail.inbound === 'connected' ? 'kiruvchi xatlar qabul qilinadi' : 'kiruvchi xatlar uchun EMAIL_INBOUND_SECRET berilmagan';
    return [
      { key: 'pbx', name: 'IP-ATS (Grandstream UCM6510)', status: pbx === 'mock' ? 'test' : 'connected', note: pbx === 'mock' ? 'Test rejimi (PBX_DRIVER=mock)' : 'PBX_DRIVER=ucm6510' },
      { key: 'recordings', name: 'Yozuvlar arxivi', status: 'connected', note: `Lokal papka: ${this.config.get<string>('RECORDINGS_DIR') ?? 'storage/recordings'} · NAS/MinIO — 5-etap` },
      {
        key: 'sms',
        name: 'SMS shlyuzi',
        status: sms.state,
        note:
          sms.state === 'off'
            ? "Ulanmagan (SMS_DRIVER=eskiz | http): fuqaroga SMS va SMS-kod bilan kirish navbatda turadi"
            : sms.state === 'test'
              ? 'Test rejimi (SMS_DRIVER=log): SMS yuborilmaydi, server jurnaliga yoziladi'
              : `${sms.driver === 'eskiz' ? 'Eskiz.uz' : 'HTTP shlyuz'}${this.sms.lastError ? ` · xato: ${this.sms.lastError}` : ''}`,
      },
      {
        key: 'smtp',
        name: 'Pochta serveri (SMTP)',
        status: mail.outbound,
        note:
          mail.outbound === 'off'
            ? `Ulanmagan (SMTP_HOST, SMTP_FROM): omnikanal email javoblari navbatda turadi · ${inbound}`
            : `${this.email.address ?? ''}${this.email.lastError ? ` · xato: ${this.email.lastError}` : ''} · ${inbound}`,
      },
      {
        key: 'telegram',
        name: 'Telegram bot',
        status: tg,
        note:
          tg === 'off'
            ? 'Ulanmagan (TELEGRAM_BOT_TOKEN): omnikanalning Telegram kanali'
            : tg === 'connected'
              ? `@${this.telegram.username} · ${this.telegram.mode === 'webhook' ? 'webhook' : 'long polling'}`
              : `Ulanib bo'lmadi: ${this.telegram.lastError ?? 'kutilmoqda'}`,
      },
      {
        key: 'telegram_alerts',
        name: 'Telegram: ogohlantirishlar guruhi',
        status: this.notifications.telegramGroupConfigured ? 'connected' : 'off',
        note: this.notifications.telegramGroupConfigured ? 'TELEGRAM_ALERTS_CHAT_ID' : "Ulanmagan: bot tokeni va guruh id'si (TELEGRAM_ALERTS_CHAT_ID) kerak",
      },
    ];
  }

  private diff(before: unknown, after: unknown): Record<string, { from: unknown; to: unknown }> {
    if (typeof before !== 'object' || before === null || typeof after !== 'object' || after === null) return { value: { from: before, to: after } };
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(after)) {
      const a = (before as Record<string, unknown>)[key];
      const b = (after as Record<string, unknown>)[key];
      if (JSON.stringify(a) !== JSON.stringify(b)) changes[key] = { from: typeof a === 'object' ? JSON.stringify(a) : a, to: typeof b === 'object' ? JSON.stringify(b) : b };
    }
    return changes;
  }
}

@ApiTags('settings')
@Controller('settings')
export class SystemSettingsController {
  constructor(private readonly system: SystemSettingsService) {}

  @Get('system')
  @RequirePermissions(Permission.SettingsManage)
  get() {
    return this.system.get();
  }

  @Put('system')
  @RequirePermissions(Permission.SettingsManage)
  save(@CurrentUser() user: AuthUser, @Body() dto: SystemSettingsDto) {
    return this.system.save(user, dto);
  }

  @Post('holidays')
  @RequirePermissions(Permission.SettingsManage)
  addHoliday(@CurrentUser() user: AuthUser, @Body() dto: HolidayDto) {
    return this.system.addHoliday(user, dto);
  }

  @Delete('holidays/:id')
  @HttpCode(204)
  @RequirePermissions(Permission.SettingsManage)
  removeHoliday(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.system.removeHoliday(user, id);
  }
}

@Module({
  imports: [TelephonyModule],
  controllers: [SystemSettingsController],
  providers: [SystemSettingsService],
})
export class SystemSettingsModule {}
