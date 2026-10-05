import { GlobalOutlined, LogoutOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Avatar, Button, Layout, Menu, Tooltip, type MenuProps } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { P } from '../constants';
import { HELP_ENTRY, MENU, type MenuEntry } from './menu';
import SecurityModal from './SecurityModal';
import { useMenuBadges } from './useMenuBadges';
import TopBar from './TopBar';

const { Sider, Content } = Layout;

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

export default function AppLayout() {
  const { user, can, canAny, logout } = useAuth();
  const badges = useMenuBadges(can(P.TicketsRead), can(P.MonitoringView), can(P.TicketsCreate));
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [security, setSecurity] = useState(false);
  // Telefon/planshetda menyu butunlay yashirinadi va ustidan ochiladi
  const [narrow, setNarrow] = useState(false);

  const groups = useMemo(
    () =>
      MENU.map((group) => ({ ...group, items: group.items.filter((item) => canAny(item.permission)) })).filter(
        (group) => group.items.length > 0,
      ),
    [canAny],
  );

  const selectedKey =
    groups
      .flatMap((g) => g.items)
      .map((i) => i.path)
      .find((path) => location.pathname === path || location.pathname.startsWith(`${path}/`)) ?? location.pathname;

  const activeGroup = groups.find((g) => g.items.some((i) => i.path === selectedKey))?.key;
  const defaultOpen = Array.from(new Set(['crm', activeGroup].filter((k): k is string => !!k)));
  const [openKeys, setOpenKeys] = useState<string[]>(defaultOpen);

  const extraOf = (item: MenuEntry) => {
    const count = item.badge ? badges[item.badge] : 0;
    return count > 0 ? (
      <span className={`menu-badge is-${item.badge}`} aria-label={`${count} ta`}>
        {count > 99 ? '99+' : count}
      </span>
    ) : undefined;
  };

  const items = useMemo<MenuProps['items']>(
    () => [
      ...groups.map((group) => ({
        key: group.key,
        icon: group.icon,
        label: group.label,
        children: group.items.map((item) => ({
          key: item.path,
          icon: item.icon,
          label: <span className="menu-label">{item.label}</span>,
          title: item.label,
          extra: extraOf(item),
        })),
      })),
      // Prototipdagi kabi guruhlardan keyin alohida band
      {
        key: HELP_ENTRY.path,
        icon: HELP_ENTRY.icon,
        label: <span className="menu-label">{HELP_ENTRY.label}</span>,
        title: HELP_ENTRY.label,
        extra: extraOf(HELP_ENTRY),
        className: 'menu-help',
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, badges],
  );

  // Ctrl+K — sahifadagi asosiy qidiruv maydoniga o'tish (Dizayn tizimi → Klaviatura yorliqlari)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        const input = document.querySelector<HTMLInputElement>('input[data-hotkey="search"]');
        if (input) {
          e.preventDefault();
          input.focus();
          input.select();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onCollapse = (next: boolean) => {
    setCollapsed(next);
    setOpenKeys(next ? [] : defaultOpen);
  };

  const sub = user?.sipExtension ? `SIP ${user.sipExtension} · ${user.orgUnitName}` : user?.orgUnitName;

  return (
    <Layout style={{ minHeight: '100%' }}>
      <Sider
        className="app-sider"
        width={264}
        collapsible
        collapsed={collapsed}
        onCollapse={onCollapse}
        breakpoint="lg"
        onBreakpoint={setNarrow}
        collapsedWidth={narrow ? 0 : 80}
        zeroWidthTriggerStyle={{ top: 12 }}
      >
        <div className="sider-brand">
          <span className="sider-logo" aria-hidden="true">
            <GlobalOutlined />
          </span>
          {!collapsed && (
            <span className="sider-brand-text">
              <span className="sider-brand-name">1097 Call-markaz</span>
              <span className="sider-brand-sub">Kadastr agentligi</span>
            </span>
          )}
        </div>
        <nav className="sider-menu" aria-label="Asosiy menyu">
          <Menu
            theme="dark"
            mode="inline"
            inlineIndent={14}
            items={items}
            selectedKeys={[selectedKey]}
            openKeys={openKeys}
            onOpenChange={setOpenKeys}
            onClick={({ key }) => {
              navigate(key);
              if (narrow) onCollapse(true);
            }}
          />
        </nav>
        <div className="sider-user">
          <Avatar className="sider-avatar">{initials(user?.fullName ?? '')}</Avatar>
          {!collapsed && (
            <span className="sider-user-text">
              <span className="sider-user-name">{user?.fullName}</span>
              <span className="sider-user-sub">{sub}</span>
            </span>
          )}
          {!collapsed && (
            <Tooltip title="Xavfsizlik: ikki bosqichli himoya">
              <Button type="text" className="sider-logout" icon={<SafetyCertificateOutlined />} aria-label="Xavfsizlik" onClick={() => setSecurity(true)} />
            </Tooltip>
          )}
          <Tooltip title="Tizimdan chiqish" placement={collapsed ? 'right' : 'top'}>
            <Button
              type="text"
              className="sider-logout"
              icon={<LogoutOutlined />}
              aria-label="Tizimdan chiqish"
              onClick={() => void logout().then(() => navigate('/login'))}
            />
          </Tooltip>
        </div>
      </Sider>
      <Layout>
        <TopBar />
        <Content className="app-content">
          <Outlet />
        </Content>
        {security && <SecurityModal onClose={() => setSecurity(false)} />}
      </Layout>
    </Layout>
  );
}
