import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Permission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';
import { EmailChannel, TelegramBot } from './channels';
import { SmsService } from './sms';

export interface StaffNotice {
  /** ticket.assigned, ticket.due_soon, ticket.overdue, alert.critical, ... */
  type: string;
  title: string;
  body?: string | null;
  /** Ilova ichidagi havola: /tickets/123 */
  link?: string | null;
}

/** Email orqali yuboriladigan bildirishnoma turlari (qolganlari faqat tizim ichida). */
const EMAIL_TYPES = new Set(['ticket.assigned', 'ticket.due_soon', 'ticket.overdue', 'ticket.rejected', 'ticket.returned', 'ticket.duplicate', 'alert.critical', 'billing.limit']);

/**
 * Xodimlarga bildirishnomalar (F-NOT-02): tizim ichida (qo'ng'iroqcha + real vaqt), email (SMTP ulangan va
 * xodimning manzili bo'lsa) va ogohlantirishlar uchun Telegram guruhi (TELEGRAM_ALERTS_CHAT_ID).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly appUrl: string;
  private readonly alertsChat?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly settings: SettingsService,
    private readonly email: EmailChannel,
    private readonly telegram: TelegramBot,
    private readonly sms: SmsService,
    config: ConfigService,
  ) {
    this.appUrl = (config.get<string>('APP_URL') ?? config.get<string>('CORS_ORIGIN')?.split(',')[0] ?? 'http://localhost:5173').replace(/\/$/, '');
    this.alertsChat = config.get<string>('TELEGRAM_ALERTS_CHAT_ID') || undefined;
  }

  async notifyUsers(userIds: number[], notice: StaffNotice): Promise<void> {
    const ids = [...new Set(userIds)].filter((id) => Number.isInteger(id));
    if (ids.length === 0) return;
    await this.prisma.notification.createMany({
      data: ids.map((userId) => ({ userId, type: notice.type, title: notice.title, body: notice.body ?? null, link: notice.link ?? null })),
    });
    for (const userId of ids) {
      this.realtime.emitToUser(userId, 'notification', { type: notice.type, title: notice.title, body: notice.body, link: notice.link });
    }
    if (EMAIL_TYPES.has(notice.type)) void this.emailUsers(ids, notice);
  }

  /** Bir nechta bildirishnoma (har biri o'z qabul qiluvchilari bilan). */
  async notifyMany(items: { userIds: number[]; notice: StaffNotice }[]): Promise<void> {
    for (const item of items) await this.notifyUsers(item.userIds, item.notice);
  }

  private async emailUsers(ids: number[], notice: StaffNotice): Promise<void> {
    if (!this.email.smtp) return;
    try {
      const staff = await this.settings.get('staff_notify');
      if (!staff.email) return;
      const users = await this.prisma.user.findMany({ where: { id: { in: ids }, isActive: true, email: { not: null } }, select: { email: true } });
      const link = notice.link ? `\n\n${this.appUrl}${notice.link}` : '';
      for (const user of users) {
        await this.email
          .send({ to: user.email!, subject: `1097 Call-markaz: ${notice.title}`, text: `${notice.title}\n\n${notice.body ?? ''}${link}\n\n— Avtomatik xabar, javob yozmang.` })
          .catch((err: unknown) => this.logger.warn(`Email yuborilmadi (${notice.type}): ${err instanceof Error ? err.message : String(err)}`));
      }
    } catch (err) {
      this.logger.warn(`Email bildirishnomalari yuborilmadi: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Ogohlantirishlar Telegram guruhiga; guruh yoki bot sozlanmagan bo'lsa false. */
  async telegramGroup(text: string): Promise<boolean> {
    if (!this.alertsChat || !this.telegram.client) return false;
    try {
      await this.telegram.client.sendMessage(this.alertsChat, text);
      return true;
    } catch (err) {
      this.logger.warn(`Telegram guruhiga yuborilmadi: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** Xodimlarga SMS (masalan, kritik ogohlantirish): telefoni kiritilgan faol xodimlarga. */
  async smsStaff(userIds: number[], text: string): Promise<number> {
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds }, isActive: true, phone: { not: null } }, select: { phone: true } });
    let sent = 0;
    for (const user of users) if (await this.sms.send({ phone: user.phone!, text, template: 'staff_alert' })) sent++;
    return sent;
  }

  get telegramGroupConfigured(): boolean {
    return !!this.alertsChat && !!this.telegram.client;
  }

  // ───────────── Qabul qiluvchilar ─────────────

  /** Bo'linma rahbarlari: shu bo'linmaning taqsimlash huquqi bor faol xodimlari. */
  async unitHeads(orgUnitIds: (number | null | undefined)[]): Promise<number[]> {
    const ids = [...new Set(orgUnitIds.filter((id): id is number => typeof id === 'number'))];
    if (ids.length === 0) return [];
    const rows = await this.prisma.user.findMany({
      where: { isActive: true, orgUnitId: { in: ids }, roles: { some: { role: { permissions: { has: Permission.TicketsAssign } } } } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Call-markaz supervisorlari: yo'naltirish va monitoring huquqi bor xodimlar. */
  async supervisors(): Promise<number[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        isActive: true,
        AND: [
          { roles: { some: { role: { permissions: { has: Permission.MonitoringView } } } } },
          { roles: { some: { role: { permissions: { has: Permission.TicketsRoute } } } } },
        ],
      } satisfies Prisma.UserWhereInput,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
