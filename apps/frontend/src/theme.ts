import type { ThemeConfig } from 'antd';

// Prototip dizayn tizimidan (Call-center prototipi → "Dizayn tizimi" artboardi)
export const BRAND = {
  primary: '#0B6B6B',
  primaryDark: '#084F4F',
  primaryTint: '#E3F1F0',
  primarySoft: '#F1F7F7',
  sider: '#0F1E2B',
  siderRaised: '#162838',
  siderLine: '#1E3346',
  siderText: '#C3CEDA',
  siderMuted: '#93A3B5',
  ink: '#15191F',
  ink2: '#4B5563',
  muted: '#5F6773',
  border: '#E2E5EA',
  borderStrong: '#D5D9E0',
  bg: '#F3F4F6',
};

export const MONO = "'IBM Plex Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace";

/**
 * Holat ranglari faqat holatni bildiradi va doim yozuv bilan chiqadi (rang yolg'iz ishlatilmaydi).
 * bg — fon, fg — matn, dot — nuqta va ikonka.
 */
export const TONE = {
  blue: { bg: '#DBEAFE', fg: '#1E3A8A', dot: '#1D4ED8' },
  teal: { bg: '#E3F1F0', fg: '#084F4F', dot: '#0B6B6B' },
  amber: { bg: '#FEF3C7', fg: '#78350F', dot: '#B45309' },
  violet: { bg: '#EDE9FE', fg: '#4C1D95', dot: '#6D28D9' },
  green: { bg: '#DCFCE7', fg: '#14532D', dot: '#15803D' },
  pink: { bg: '#FCE7F3', fg: '#831843', dot: '#BE185D' },
  red: { bg: '#FEE2E2', fg: '#7F1D1D', dot: '#B91C1C' },
  grey: { bg: '#EEF0F3', fg: '#374151', dot: '#6B7280' },
} as const;

export type Tone = keyof typeof TONE;

export const theme: ThemeConfig = {
  token: {
    colorPrimary: BRAND.primary,
    colorLink: BRAND.primary,
    colorLinkHover: BRAND.primaryDark,
    colorSuccess: TONE.green.dot,
    colorWarning: TONE.amber.dot,
    colorError: TONE.red.dot,
    colorInfo: TONE.blue.dot,
    colorText: BRAND.ink,
    colorTextSecondary: BRAND.ink2,
    colorTextDescription: BRAND.muted,
    colorBorder: BRAND.borderStrong,
    colorBorderSecondary: BRAND.border,
    colorBgLayout: BRAND.bg,
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontFamilyCode: MONO,
    fontSize: 14,
    borderRadius: 8,
    borderRadiusLG: 12,
    controlHeight: 40,
    controlHeightSM: 32,
    controlHeightLG: 48,
  },
  components: {
    Layout: {
      siderBg: BRAND.sider,
      headerBg: '#ffffff',
      headerHeight: 64,
      headerPadding: '0 20px',
      bodyBg: BRAND.bg,
      triggerBg: BRAND.siderRaised,
    },
    Menu: {
      darkItemBg: BRAND.sider,
      darkSubMenuItemBg: BRAND.sider,
      darkPopupBg: BRAND.sider,
      darkItemColor: BRAND.siderText,
      darkItemHoverBg: '#18293A',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: BRAND.primary,
      darkItemSelectedColor: '#ffffff',
      darkGroupTitleColor: BRAND.siderMuted,
      itemHeight: 38,
      itemBorderRadius: 8,
      itemMarginInline: 10,
      subMenuItemBorderRadius: 8,
    },
    Card: {
      headerFontSize: 15,
    },
    Table: {
      headerBg: '#FAFBFC',
      headerColor: BRAND.ink2,
      headerSplitColor: 'transparent',
      rowHoverBg: '#F7F9FA',
      rowSelectedBg: BRAND.primarySoft,
      rowSelectedHoverBg: BRAND.primaryTint,
    },
    Tabs: {
      itemSelectedColor: BRAND.primaryDark,
      inkBarColor: BRAND.primary,
    },
    Segmented: {
      itemSelectedColor: BRAND.ink,
      trackBg: '#EEF0F3',
    },
    Tag: {
      defaultBg: TONE.grey.bg,
      defaultColor: TONE.grey.fg,
    },
  },
};
