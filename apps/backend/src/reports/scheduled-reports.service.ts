import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExportTemplate } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toAuthUser } from '../auth/auth.service';
import { AuthUser } from '../common/auth-user';
import { describePeriod } from '../common/period';
import { Permission } from '../common/permissions';
import { EmailChannel } from '../integrations/channels';
import { NotificationsService } from '../integrations/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportExportService } from './report-export.service';
import { describeSchedule, parseSchedule, scheduledPeriod, scheduleMatches } from './report-schedule';

const TICK_MS = 60_000;

export interface DeliveryResult {
  status: 'ok' | 'partial' | 'error';
  note: string;
  sent: number;
  recipients: number;
  period: string | null;
}

/**
 * Jadval bo'yicha hisobotlar (F-REP-05): faol shablonning jadvali kelganda fayl har bir qabul qiluvchi uchun uning
 * o'z ko'rish doirasida tuziladi va SMTP orqali ilova bilan yuboriladi. Har daqiqada tekshiriladi; bir nechta backend
 * nusxasi bo'lsa ham shablon bir marta yuboriladi (lastRunAt shartli yangilanadi). REPORT_SCHEDULER=false — o'chiq.
 */
@Injectable()
export class ScheduledReportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledReportsService.name);
  private readonly enabled: boolean;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly exports: ReportExportService,
    private readonly email: EmailChannel,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {
    this.enabled = config.get<string>('REPORT_SCHEDULER') !== 'false';
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    // Daqiqa boshiga tekislanadi: "0 18 * * *" aynan 18:00 da tekshiriladi
    const delay = TICK_MS - (Date.now() % TICK_MS) + 1_000;
    setTimeout(() => {
      void this.tick();
      this.timer = setInterval(() => void this.tick(), TICK_MS);
    }, delay).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(at = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const minute = new Date(at);
      minute.setSeconds(0, 0);
      const templates = await this.prisma.exportTemplate.findMany({ where: { isActive: true, schedule: { not: null } } });
      let started = 0;
      for (const template of templates) {
        const schedule = parseSchedule(template.schedule);
        if (!schedule || !scheduleMatches(schedule, at)) continue;
        // Shu daqiqada boshqa nusxa yuborgan bo'lsa — o'tkazib yuboriladi
        const claimed = await this.prisma.exportTemplate.updateMany({
          where: { id: template.id, OR: [{ lastRunAt: null }, { lastRunAt: { lt: minute } }] },
          data: { lastRunAt: at },
        });
        if (claimed.count === 0) continue;
        started++;
        await this.deliver(template, at, null).catch((err) => this.logger.error(`Hisobot yuborilmadi: ${template.name}`, err instanceof Error ? err.stack : String(err)));
      }
      return started;
    } finally {
      this.running = false;
    }
  }

  /** Administrator "Hozir yuborish" — jadvalni kutmasdan (sinov va qayta yuborish uchun). */
  async sendNow(actor: AuthUser, id: number): Promise<DeliveryResult> {
    const template = await this.prisma.exportTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Shablon topilmadi');
    return this.deliver(template, new Date(), actor);
  }

  private async deliver(template: ExportTemplate, at: Date, actor: AuthUser | null): Promise<DeliveryResult> {
    const result = await this.compose(template, at);
    await this.prisma.exportTemplate.update({
      where: { id: template.id },
      data: { lastRunAt: at, lastRunStatus: result.status, lastRunNote: result.note },
    });
    await this.audit.log({
      actorId: actor?.id ?? null,
      action: 'report.scheduled',
      entityType: 'ExportTemplate',
      entityId: template.id,
      details: { name: template.name, status: result.status, sent: result.sent, recipients: result.recipients, period: result.period, manual: !!actor, note: result.note },
    });
    // Jadval bo'yicha yuborish umuman bajarilmasa administratorlar bilsin (email ishlamayotgan bo'lishi mumkin)
    if (!actor && result.status === 'error') {
      const admins = await this.prisma.user.findMany({
        where: { isActive: true, roles: { some: { role: { permissions: { has: Permission.SettingsManage } } } } },
        select: { id: true },
      });
      await this.notifications.notifyUsers(
        admins.map((a) => a.id),
        { type: 'report.failed', title: `Hisobot yuborilmadi: ${template.name}`, body: result.note, link: '/crm/export' },
      );
    }
    return result;
  }

  private async compose(template: ExportTemplate, at: Date): Promise<DeliveryResult> {
    const fail = (note: string): DeliveryResult => ({ status: 'error', note, sent: 0, recipients: 0, period: null });
    if (!template.isActive) return fail("Shablon o'chirilgan");
    if (!template.recipientRoles.length) return fail('Qabul qiluvchi rollar tanlanmagan');
    if (!this.email.smtp) return fail('SMTP sozlanmagan (SMTP_HOST, SMTP_FROM)');

    const users = await this.prisma.user.findMany({
      where: { isActive: true, roles: { some: { role: { code: { in: template.recipientRoles } } } } },
      include: { orgUnit: true, roles: { include: { role: true } } },
      orderBy: { id: 'asc' },
    });
    if (!users.length) return fail("Tanlangan rollarda faol foydalanuvchi yo'q");

    const schedule = parseSchedule(template.schedule);
    const range = scheduledPeriod(schedule, at);
    const period = { ...range, bucket: range.to.getTime() - range.from.getTime() <= 86_400_000 ? ('hour' as const) : ('day' as const) };
    let sent = 0;
    let noEmail = 0;
    let noAccess = 0;
    const errors: string[] = [];
    let subtitle = describePeriod(period);

    for (const user of users) {
      if (!user.email) {
        noEmail++;
        continue;
      }
      let built;
      try {
        // Har bir qabul qiluvchi faqat o'z ko'rish doirasidagi ma'lumotni oladi
        built = await this.exports.templateFile(toAuthUser(user), template, period);
      } catch {
        noAccess++;
        continue;
      }
      subtitle = built.subtitle;
      try {
        await this.email.send({
          to: user.email,
          subject: `${template.name} · ${built.subtitle}`,
          text: [
            `Assalomu alaykum, ${user.fullName}!`,
            '',
            `"${template.name}" hisoboti ilovada (${built.subtitle}, ${built.rows} qator).`,
            `Jadval: ${schedule ? describeSchedule(schedule) : "qo'lda yuborildi"}. Ma'lumotlar sizning ko'rish doirangiz bo'yicha tuzilgan.`,
            '',
            "1097 Call-markaz tizimi. Xat avtomatik yuborildi — javob yozmang.",
          ].join('\n'),
          attachments: [{ fileName: built.file.fileName, contentType: built.file.mime, content: built.file.body }],
        });
        sent++;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    const parts = [`${sent} ta yuborildi`];
    if (noEmail) parts.push(`${noEmail} ta email manzili yo'q`);
    if (noAccess) parts.push(`${noAccess} ta hisobotga huquqi yo'q`);
    if (errors.length) parts.push(`${errors.length} ta xato: ${errors[0]}`);
    const status = sent === 0 ? 'error' : noEmail || noAccess || errors.length ? 'partial' : 'ok';
    return { status, note: parts.join(' · '), sent, recipients: users.length, period: subtitle };
  }
}
