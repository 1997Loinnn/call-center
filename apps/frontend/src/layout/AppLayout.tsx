import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { App, Avatar, Dropdown, Layout, Menu, Space, Typography, type MenuProps } from 'antd';
import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AgentStatusControl from '../components/AgentStatusControl';
import { P } from '../constants';
import { useSocketEvent } from '../realtime/socket';
import { MENU } from './menu';

const { Sider, Header, Content } = Layout;

interface NotificationPayload {
  type: string;
  title: string;
  body?: string;
  link?: string;
}

export default function AppLayout() {
  const { user, can, logout } = useAuth();
  const { notification } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // Shaxsiy bildirishnomalar (yangi murojaat, javob qaytarildi) — real vaqtda
  useSocketEvent<NotificationPayload>('notification', (n) => {
    notification.info({
      message: n.title,
      description: n.body,
      onClick: () => n.link && navigate(n.link),
      style: { cursor: n.link ? 'pointer' : 'default' },
    });
  });

  const items = useMemo<MenuProps['items']>(
    () =>
      MENU.map((group) => ({
        type: 'group' as const,
        key: group.label,
        label: group.label,
        children: group.items
          .filter((item) => can(item.permission))
          .map((item) => ({ key: item.path, icon: item.icon, label: item.label })),
      })).filter((group) => group.children.length > 0),
    [can],
  );

  const selectedKey =
    MENU.flatMap((g) => g.items)
      .map((i) => i.path)
      .find((path) => location.pathname === path || location.pathname.startsWith(`${path}/`)) ?? location.pathname;

  const userMenu: MenuProps['items'] = [
    { key: 'unit', label: user?.orgUnitName, disabled: true },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Chiqish', danger: true },
  ];

  return (
    <Layout style={{ minHeight: '100%' }}>
      <Sider width={248} collapsible collapsed={collapsed} onCollapse={setCollapsed} breakpoint="lg">
        <div style={{ padding: collapsed ? '18px 8px' : '18px 20px', color: '#fff' }}>
          <div style={{ fontWeight: 600, fontSize: collapsed ? 14 : 17, whiteSpace: 'nowrap' }}>
            {collapsed ? '1097' : 'Call-markaz 1097'}
          </div>
          {!collapsed && <div style={{ fontSize: 12, opacity: 0.6 }}>Kadastr agentligi</div>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          items={items}
          selectedKeys={[selectedKey]}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16, borderBottom: '1px solid #e8ecef' }}>
          {can(P.TelephonyUse) && <AgentStatusControl />}
          <Dropdown
            menu={{
              items: userMenu,
              onClick: ({ key }) => {
                if (key === 'logout') void logout().then(() => navigate('/login'));
              },
            }}
          >
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} style={{ background: '#0B6B6B' }} />
              <Typography.Text>{user?.fullName}</Typography.Text>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
