import { DataScope } from '@prisma/client';
import { Permission as P, PermissionCode } from './permissions';

export interface SystemRoleDefinition {
  code: string;
  name: string;
  description: string;
  scope: DataScope;
  permissions: PermissionCode[];
}

/**
 * Tizim rollari (TZ 4-bo'lim jadvali). Seed shu ro'yxatdan rollarni yaratadi;
 * administrator keyin qo'shimcha rollar yarata oladi.
 */
export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    code: 'ADMIN',
    name: 'Tizim administratori',
    description: "Foydalanuvchilar, rollar, tuzilma va sozlamalar. Fuqarolar ma'lumotlariga kirish yo'q.",
    scope: DataScope.OWN,
    permissions: [P.UsersManage, P.OrgRead, P.OrgManage, P.SettingsManage],
  },
  {
    code: 'DIRECTOR',
    name: 'Direktor',
    description: 'Butun tizim, shu jumladan korrupsiya xabarlari',
    scope: DataScope.ALL,
    permissions: [
      P.TicketsRead,
      P.TicketsConfidential,
      P.TicketsApprove,
      P.TicketsReopen,
      P.CitizensRead,
      P.CallsRead,
      P.RecordingsPlay,
      P.MonitoringView,
      P.ReportsView,
      P.OrgRead,
    ],
  },
  {
    code: 'LEADERSHIP',
    name: 'Rahbariyat',
    description: "Direktor o'rinbosarlari: dashboard, hisobotlar, yozuvlarni tinglash",
    scope: DataScope.ALL,
    permissions: [
      P.TicketsRead,
      P.TicketsReopen,
      P.CitizensRead,
      P.CallsRead,
      P.RecordingsPlay,
      P.MonitoringView,
      P.ReportsView,
      P.OrgRead,
    ],
  },
  {
    code: 'SUPERVISOR',
    name: 'Supervisor',
    description: "Call-markaz rahbari yoki smena boshlig'i",
    scope: DataScope.UNIT_TREE,
    permissions: [
      P.TicketsRead,
      P.TicketsCreate,
      P.TicketsRoute,
      P.TicketsReopen,
      P.CitizensRead,
      P.CallsRead,
      P.RecordingsPlay,
      P.TelephonyUse,
      P.MonitoringView,
      P.ReportsView,
      P.OrgRead,
    ],
  },
  {
    code: 'OPERATOR',
    name: 'Operator',
    description: "Qo'ng'iroq qabul qilish, murojaat yaratish va yo'naltirish",
    scope: DataScope.OWN,
    permissions: [
      P.TicketsRead,
      P.TicketsCreate,
      P.TicketsRoute,
      P.CitizensRead,
      P.CallsRead,
      P.TelephonyUse,
      P.OrgRead,
    ],
  },
  {
    code: 'UNIT_HEAD',
    name: "Bo'linma rahbari",
    description: 'Murojaatni ijrochiga taqsimlash, javobni tasdiqlash',
    scope: DataScope.UNIT_TREE,
    permissions: [
      P.TicketsRead,
      P.TicketsAssign,
      P.TicketsAnswer,
      P.TicketsApprove,
      P.CitizensRead,
      P.ReportsView,
      P.OrgRead,
    ],
  },
  {
    code: 'EXECUTOR',
    name: 'Ijrochi',
    description: "O'ziga biriktirilgan murojaatga javob tayyorlash",
    scope: DataScope.OWN,
    permissions: [P.TicketsRead, P.TicketsAnswer, P.CitizensRead, P.OrgRead],
  },
  {
    code: 'ANTI_CORRUPTION',
    name: "Korrupsiyaga qarshi kurash bo'limi",
    description: "Korrupsiya xabarlari. Bu toifa yo'naltirish jadvali bo'yicha faqat shu bo'limga tushadi.",
    scope: DataScope.UNIT,
    permissions: [
      P.TicketsRead,
      P.TicketsConfidential,
      P.TicketsAssign,
      P.TicketsAnswer,
      P.TicketsApprove,
      P.CitizensRead,
      P.OrgRead,
    ],
  },
  {
    code: 'AUDITOR',
    name: 'Auditor',
    description: "Audit jurnalini faqat o'qish",
    scope: DataScope.OWN,
    permissions: [P.AuditRead],
  },
];
