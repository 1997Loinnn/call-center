import type { ThemeConfig } from 'antd';

// Prototip dizayn tizimidan: teal asosiy rang, to'q ko'k (navy) yon panel, IBM Plex Sans
export const BRAND = {
  primary: '#0B6B6B',
  sider: '#0E2240',
};

export const theme: ThemeConfig = {
  token: {
    colorPrimary: BRAND.primary,
    colorLink: BRAND.primary,
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    borderRadius: 6,
  },
  components: {
    Layout: {
      siderBg: BRAND.sider,
      headerBg: '#ffffff',
      headerPadding: '0 24px',
      bodyBg: '#f4f6f8',
    },
    Menu: {
      darkItemBg: BRAND.sider,
      darkSubMenuItemBg: BRAND.sider,
      darkItemSelectedBg: BRAND.primary,
      darkGroupTitleColor: 'rgba(255, 255, 255, 0.45)',
    },
  },
};
