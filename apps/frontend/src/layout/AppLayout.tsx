import { GlobalOutlined, LogoutOutlined } from '@ant-design/icons';
import { Avatar, Button, Layout, Menu, Tooltip, type MenuProps } from 'antd';
import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isPlanned, MENU } from './menu';
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
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  // Telefon/planshetda menyu butunlay yashirinadi va ustidan ochiladi
  const [narrow, setNarrow] = useState(false);

  const groups = useMemo(
    () =>
      MENU.map((group) => ({ ...group, items: group.items.filter((item) => can(item.permission)) })).filter(
        (group) => group.items.length > 0,
      ),
    [can],
  );

  const selectedKey =
    groups
      .flatMap((g) => g.items)
      .map((i) => i.path)
      .find((path) => location.pathname === path || location.pathname.startsWith(`${path}/`)) ?? location.pathname;

  const activeGroup = groups.find((g) => g.items.some((i) => i.path === selectedKey))?.key;
  const defaultOpen = Array.from(new Set(['crm', activeGroup].filter((k): k is string => !!k)));
  const [openKeys, setOpenKeys] = useState<string[]>(defaultOpen);

  const items = useMemo<MenuProps['items']>(
    () =>
      groups.map((group) => ({
        key: group.key,
        icon: group.icon,
        label: group.label,
        children: group.items.map((item) => ({
          key: item.path,
          icon: item.icon,
          label: <span className="menu-label">{item.label}</span>,
          title: item.label,
          extra: isPlanned(item.path) ? <span className="planned-tag">reja</span> : undefined,
        })),
      })),
    [groups],
  );

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
      </Layout>
    </Layout>
  );
}
