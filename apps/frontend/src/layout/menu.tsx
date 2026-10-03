import {
  AlertOutlined,
  AppstoreOutlined,
  FundOutlined,
  SafetyOutlined,
  ApartmentOutlined,
  AuditOutlined,
  BarChartOutlined,
  BranchesOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  ExportOutlined,
  FileTextOutlined,
  HeartOutlined,
  MessageOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TagsOutlined,
  TeamOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { P } from '../constants';

export interface MenuEntry {
  path: string;
  label: string;
  icon: ReactNode;
  permission: string;
}

export interface MenuGroup {
  key: string;
  label: string;
  icon: ReactNode;
  items: MenuEntry[];
}

/** Hali tayyor bo'lmagan modul (PlaceholderPage): menyuda «reja» belgisi bilan chiqadi. */
export const isPlanned = (path: string): boolean => path.startsWith('/soon/');

/**
 * Menyu guruhlari mavjud "CRM Call Center" (org.imv.uz) tuzilmasiga mos.
 * /soon/... — yo'l xaritasidagi keyingi bosqich modullari (PlaceholderPage).
 */
export const MENU: MenuGroup[] = [
  {
    key: 'crm',
    label: 'CRM',
    icon: <AppstoreOutlined />,
    items: [
      { path: '/dashboard', label: 'Bosh sahifa', icon: <DashboardOutlined />, permission: P.ReportsView },
      { path: '/operator', label: 'Operator paneli', icon: <CustomerServiceOutlined />, permission: P.TicketsCreate },
      { path: '/tickets', label: 'Murojaatlar', icon: <FileTextOutlined />, permission: P.TicketsRead },
      { path: '/soon/routing', label: "Yo'naltirish qoidalari", icon: <BranchesOutlined />, permission: P.OrgManage },
      { path: '/soon/categories', label: 'Murojaat toifalari', icon: <TagsOutlined />, permission: P.SettingsManage },
      { path: '/soon/export', label: 'Eksport shablonlari', icon: <ExportOutlined />, permission: P.ReportsView },
    ],
  },
  {
    key: 'telephony',
    label: 'Telefoniya',
    icon: <PhoneOutlined />,
    items: [
      { path: '/calls', label: "Qo'ng'iroqlar jurnali", icon: <PhoneOutlined />, permission: P.CallsRead },
      { path: '/soon/ivr', label: 'Navbatlar va IVR', icon: <ApiOutlined />, permission: P.SettingsManage },
    ],
  },
  {
    key: 'messaging',
    label: 'Xabar almashish',
    icon: <MessageOutlined />,
    items: [{ path: '/soon/omnichannel', label: 'Omnikanal', icon: <MessageOutlined />, permission: P.TicketsCreate }],
  },
  {
    key: 'control',
    label: 'Boshqaruv markazi',
    icon: <FundOutlined />,
    items: [
      { path: '/soon/live', label: 'Jonli holat', icon: <HeartOutlined />, permission: P.MonitoringView },
      { path: '/soon/alerts', label: 'Ogohlantirishlar', icon: <AlertOutlined />, permission: P.MonitoringView },
      { path: '/soon/analytics', label: 'Analitika va hisobotlar', icon: <BarChartOutlined />, permission: P.ReportsView },
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
    items: [{ path: '/soon/settings', label: 'Sozlamalar', icon: <SettingOutlined />, permission: P.SettingsManage }],
  },
];
