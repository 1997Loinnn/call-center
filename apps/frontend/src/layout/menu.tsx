import {
  AlertOutlined,
  AppstoreOutlined,
  FundOutlined,
  SafetyOutlined,
  ApartmentOutlined,
  AuditOutlined,
  BarChartOutlined,
  ControlOutlined,
  FolderOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  ExportOutlined,
  FileTextOutlined,
  HeartOutlined,
  MessageOutlined,
  PhoneFilled,
  PhoneOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  ReadOutlined,
  ApiOutlined,
  BookOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { P } from '../constants';

export interface MenuEntry {
  path: string;
  label: string;
  icon: ReactNode;
  /** Massiv bo'lsa — ruxsatlardan kamida bittasi yetarli */
  permission: string | string[];
  /** Menyudagi son: amal kutayotgan murojaatlar, faol ogohlantirishlar yoki javob kutayotgan yozishmalar */
  badge?: 'tickets' | 'alerts' | 'omni';
}

export interface MenuGroup {
  key: string;
  label: string;
  icon: ReactNode;
  items: MenuEntry[];
}

/** Menyu guruhlari mavjud "CRM Call Center" (org.imv.uz) tuzilmasiga mos. */
export const MENU: MenuGroup[] = [
  {
    key: 'crm',
    label: 'CRM',
    icon: <AppstoreOutlined />,
    items: [
      { path: '/dashboard', label: 'Bosh sahifa', icon: <DashboardOutlined />, permission: P.ReportsView },
      { path: '/operator', label: 'Operator paneli', icon: <CustomerServiceOutlined />, permission: P.TicketsCreate },
      { path: '/tickets', label: 'Murojaatlar', icon: <FileTextOutlined />, permission: P.TicketsRead, badge: 'tickets' },
      { path: '/knowledge', label: 'Bilimlar bazasi', icon: <BookOutlined />, permission: [P.TicketsCreate, P.TicketsRead, P.KnowledgeManage] },
      { path: '/crm/routing', label: "Yo'naltirish qoidalari", icon: <ControlOutlined />, permission: P.OrgManage },
      { path: '/crm/categories', label: 'Toifalar va mavzular', icon: <FolderOutlined />, permission: P.SettingsManage },
      { path: '/crm/export', label: 'Eksport shablonlari', icon: <ExportOutlined />, permission: [P.ReportsView, P.SettingsManage] },
    ],
  },
  {
    key: 'telephony',
    label: 'Telefoniya',
    icon: <PhoneOutlined />,
    items: [
      { path: '/calls', label: "Qo'ng'iroqlar jurnali", icon: <UnorderedListOutlined />, permission: P.CallsRead },
      { path: '/campaigns', label: "Chiquvchi qo'ng'iroqlar", icon: <PhoneFilled />, permission: [P.TelephonyUse, P.CampaignsManage] },
      { path: '/ivr', label: 'Navbatlar va IVR', icon: <ApiOutlined />, permission: [P.SettingsManage, P.MonitoringView] },
      { path: '/billing', label: 'Tariflar va xarajatlar', icon: <WalletOutlined />, permission: [P.ReportsView, P.SettingsManage] },
    ],
  },
  {
    key: 'messaging',
    label: 'Xabar almashish',
    icon: <MessageOutlined />,
    items: [
      { path: '/omnichannel', label: 'Omnikanal', icon: <MessageOutlined />, permission: [P.TicketsCreate, P.SettingsManage], badge: 'omni' },
    ],
  },
  {
    key: 'control',
    label: 'Boshqaruv markazi',
    icon: <FundOutlined />,
    items: [
      { path: '/live', label: 'Jonli holat', icon: <HeartOutlined />, permission: P.MonitoringView },
      { path: '/alerts', label: 'Ogohlantirishlar', icon: <AlertOutlined />, permission: P.MonitoringView, badge: 'alerts' },
      { path: '/analytics', label: 'Analitika va hisobotlar', icon: <BarChartOutlined />, permission: P.ReportsView },
      { path: '/audit', label: 'Audit jurnali', icon: <AuditOutlined />, permission: P.AuditRead },
    ],
  },
  {
    key: 'access',
    label: 'Kirish boshqaruvi',
    icon: <SafetyOutlined />,
    items: [
      { path: '/users', label: 'Foydalanuvchilar', icon: <TeamOutlined />, permission: P.UsersManage },
      { path: '/roles', label: 'Rollar va huquqlar', icon: <SafetyCertificateOutlined />, permission: P.UsersManage },
      { path: '/org-units', label: 'Tashkiliy tuzilma', icon: <ApartmentOutlined />, permission: P.OrgRead },
    ],
  },
  {
    key: 'system',
    label: 'Tizim',
    icon: <SettingOutlined />,
    items: [{ path: '/settings', label: 'Sozlamalar', icon: <SettingOutlined />, permission: P.SettingsManage }],
  },
];

/** Menyu ostidagi alohida band (prototip: "Foydalanuvchi qo'llanmasi") — hamma uchun ochiq. */
export const HELP_ENTRY: MenuEntry = { path: '/manual', label: "Foydalanuvchi qo'llanmasi", icon: <ReadOutlined />, permission: [] };
