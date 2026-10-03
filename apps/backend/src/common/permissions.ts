/**
 * Tizim ruxsatlari. Rollar shu kodlar to'plamidan tuziladi (roles.permissions).
 * TZ 4-bo'lim: foydalanuvchilar, rollar va kirish huquqlari.
 */
export const Permission = {
  TicketsRead: 'tickets.read',
  TicketsCreate: 'tickets.create',
  TicketsRoute: 'tickets.route',
  TicketsAssign: 'tickets.assign',
  TicketsAnswer: 'tickets.answer',
  TicketsApprove: 'tickets.approve',
  TicketsReopen: 'tickets.reopen',
  // Korrupsiya xabarlari va anonim murojaatchilarni ko'rish
  TicketsConfidential: 'tickets.confidential',
  CitizensRead: 'citizens.read',
  CallsRead: 'calls.read',
  RecordingsPlay: 'recordings.play',
  TelephonyUse: 'telephony.use',
  MonitoringView: 'monitoring.view',
  ReportsView: 'reports.view',
  OrgRead: 'org.read',
  OrgManage: 'org.manage',
  UsersManage: 'users.manage',
  SettingsManage: 'settings.manage',
  AuditRead: 'audit.read',
} as const;

export type PermissionCode = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: PermissionCode[] = Object.values(Permission);
