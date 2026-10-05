import { EditOutlined, PlusOutlined, StopOutlined, UnlockOutlined } from '@ant-design/icons';
import { Alert, App, Avatar, Button, Card, Form, Input, Modal, Popconfirm, Select, Switch, Table, Tag, Tooltip, TreeSelect } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { OrgTreeNode, Page, RoleRow, UserRow } from '../api/types';
import AccessNav from '../components/AccessNav';
import { toTreeSelect } from '../components/orgTree';
import ToneTag from '../components/ToneTag';
import { formatDateTime, formatNumber } from '../format';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../auth/AuthContext';

interface UserForm {
  username?: string;
  password?: string;
  fullName: string;
  orgUnitId: number;
  roleCodes: string[];
  sipExtension?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
}

interface Query {
  page: number;
  pageSize: number;
  search?: string;
  roleCode?: string;
  orgUnitId?: number;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

const isLocked = (u: UserRow) => !!u.lockedUntil && dayjs(u.lockedUntil).isAfter(dayjs());

/** Foydalanuvchilar (Kirish boshqaruvi). Parol kamida 12 belgi (TZ 9-bo'lim). */
export default function UsersPage() {
  const { message } = App.useApp();
  const { user: me } = useAuth();
  const [query, setQuery] = useState<Query>({ page: 1, pageSize: 20 });
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [form] = Form.useForm<UserForm>();
  const users = useAsync(() => api.get<Page<UserRow>>('/users', { params: query }).then((r) => r.data), [query]);
  const reference = useAsync(
    () =>
      Promise.all([
        api.get<RoleRow[]>('/roles').then((r) => r.data),
        api.get<OrgTreeNode[]>('/org-units/tree').then((r) => r.data),
      ]),
    [],
  );
  const [roles = [], orgTree = []] = reference.data ?? [];
  const treeData = useMemo(() => toTreeSelect(orgTree), [orgTree]);

  const setFilter = (patch: Partial<Query>) => setQuery((q) => ({ ...q, ...patch, page: 1 }));

  const open = (user: UserRow | 'new') => {
    setEditing(user);
    form.setFieldsValue(
      user === 'new'
        ? { roleCodes: [], isActive: true }
        : {
            fullName: user.fullName,
            orgUnitId: user.orgUnit.id,
            roleCodes: user.roles.map((r) => r.code),
            sipExtension: user.sipExtension ?? undefined,
            phone: user.phone ?? undefined,
            email: user.email ?? undefined,
            isActive: user.isActive,
          },
    );
  };

  const save = async () => {
    const values = await form.validateFields();
    try {
      if (editing === 'new') {
        await api.post('/users', values);
      } else if (editing) {
        const { password, ...rest } = values;
        await api.patch(`/users/${editing.id}`, rest);
        if (password) await api.post(`/users/${editing.id}/reset-password`, { password });
      }
      message.success('Saqlandi');
      setEditing(null);
      form.resetFields();
      void users.reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const unlock = async (user: UserRow) => {
    try {
      await api.post(`/users/${user.id}/unlock`);
      message.success(`${user.fullName}: blok olib tashlandi`);
      void users.reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  /** Telefon yo'qolsa: 2FA bekor qilinadi, keyingi kirishda foydalanuvchi ilovani qayta ulaydi. */
  const resetTwoFactor = async (user: UserRow) => {
    try {
      await api.post(`/users/${user.id}/reset-2fa`);
      message.success(`${user.fullName}: ikki bosqichli himoya bekor qilindi`);
      void users.reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  /** Hisobni bloklash (isActive=false): foydalanuvchi tizimga kira olmaydi, ma'lumotlari saqlanadi. */
  const setActive = async (user: UserRow, isActive: boolean) => {
    try {
      await api.patch(`/users/${user.id}`, { isActive });
      message.success(`${user.fullName}: ${isActive ? 'faollashtirildi' : 'bloklandi'}`);
      void users.reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const columns: ColumnsType<UserRow> = [
    {
      title: 'Foydalanuvchi',
      width: 330,
      render: (_, u) => (
        <span className="user-cell">
          <Avatar size={32} className="user-avatar">
            {initials(u.fullName)}
          </Avatar>
          <span className="cell-stack">
            <span className="cell-strong cell-ellipsis">{u.fullName}</span>
            <span className="cell-sub cell-ellipsis">
              <span className="mono">{u.username}</span> · {u.lastLoginAt ? `oxirgi kirish ${formatDateTime(u.lastLoginAt)}` : 'hali kirmagan'}
            </span>
          </span>
        </span>
      ),
    },
    { title: 'Rollar', width: 240, render: (_, u) => u.roles.map((r) => <Tag key={r.code}>{r.name}</Tag>) },
    { title: "Bo'linma", ellipsis: true, render: (_, u) => u.orgUnit.name },
    { title: 'SIP', dataIndex: 'sipExtension', width: 80, render: (v: string | null) => (v ? <span className="mono">{v}</span> : '—') },
    {
      title: '2FA',
      width: 90,
      render: (_, u) =>
        u.twoFactorEnabledAt ? (
          <Tooltip title={`Ulangan: ${formatDateTime(u.twoFactorEnabledAt)}`}>
            <span>
              <ToneTag tone="green">Yoqilgan</ToneTag>
            </span>
          </Tooltip>
        ) : (
          <span className="cell-sub">—</span>
        ),
    },
    {
      title: 'Holat',
      width: 150,
      render: (_, u) =>
        isLocked(u) ? (
          <Tooltip title={`5 marta noto'g'ri parol · ${formatDateTime(u.lockedUntil)} gacha`}>
            <span>
              <ToneTag tone="red">Bloklangan</ToneTag>
            </span>
          </Tooltip>
        ) : u.isActive ? (
          <ToneTag tone="green">Faol</ToneTag>
        ) : (
          <ToneTag tone="grey">O'chirilgan</ToneTag>
        ),
    },
    {
      title: <span className="visually-hidden">Amallar</span>,
      width: 260,
      render: (_, u) => (
        <span className="user-actions" onClick={(e) => e.stopPropagation()}>
          {isLocked(u) && (
            <Button size="small" icon={<UnlockOutlined />} onClick={() => void unlock(u)}>
              Blokdan chiqarish
            </Button>
          )}
          {u.isActive ? (
            u.id !== me?.id && (
              <Popconfirm title={`${u.fullName} bloklansinmi?`} description="Tizimga kira olmaydi, ma'lumotlari saqlanadi." okText="Bloklash" cancelText="Bekor qilish" onConfirm={() => void setActive(u, false)}>
                <Button size="small" danger icon={<StopOutlined />}>
                  Bloklash
                </Button>
              </Popconfirm>
            )
          ) : (
            <Button size="small" onClick={() => void setActive(u, true)}>
              Faollashtirish
            </Button>
          )}
          {u.twoFactorEnabledAt && (
            <Popconfirm
              title={`${u.fullName}: 2FA bekor qilinsinmi?`}
              description="Telefon yo'qolganda: keyingi kirishda ilova qayta ulanadi."
              okText="Bekor qilish"
              cancelText="Yo'q"
              onConfirm={() => void resetTwoFactor(u)}
            >
              <Button size="small">2FA</Button>
            </Popconfirm>
          )}
          <Button size="small" type="text" icon={<EditOutlined />} aria-label={`${u.fullName}: tahrirlash`} onClick={() => open(u)} />
        </span>
      ),
    },
  ];

  const isNew = editing === 'new';
  const editingUser = editing !== null && editing !== 'new' ? editing : null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Foydalanuvchilar</h1>
          <span className="page-sub">
            {users.data ? `${formatNumber(users.data.total)} ta foydalanuvchi · ` : ''}
            parol kamida 12 belgi, 5 marta xato kiritilsa hisob vaqtincha bloklanadi
          </span>
        </div>
        <div className="header-actions">
          <AccessNav />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')}>
            Yangi foydalanuvchi
          </Button>
        </div>
      </div>
      <div className="toolbar">
        <Input.Search
          placeholder="Login yoki F.I.Sh."
          aria-label="Foydalanuvchini qidirish" data-hotkey="search"
          allowClear
          style={{ width: 280 }}
          onSearch={(search) => setFilter({ search: search || undefined })}
        />
        <Select
          allowClear
          placeholder="Barcha rollar"
          aria-label="Rol"
          style={{ width: 230 }}
          value={query.roleCode}
          onChange={(roleCode?: string) => setFilter({ roleCode })}
          options={roles.map((r) => ({ value: r.code, label: r.name }))}
        />
        <TreeSelect
          allowClear
          showSearch
          treeNodeFilterProp="title"
          placeholder="Barcha bo'linmalar"
          aria-label="Bo'linma"
          style={{ width: 300 }}
          value={query.orgUnitId}
          onChange={(orgUnitId?: number) => setFilter({ orgUnitId })}
          treeData={treeData}
        />
      </div>
      {users.error && <Alert type="error" message={users.error} showIcon style={{ marginBottom: 16 }} />}
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={users.loading}
          columns={columns}
          dataSource={users.data?.items ?? []}
          scroll={{ x: 1000 }}
          rowClassName={() => 'clickable-row'}
          onRow={(u) => ({ onClick: () => open(u) })}
          pagination={{
            current: query.page,
            pageSize: query.pageSize,
            total: users.data?.total ?? 0,
            showTotal: (total, [from, to]) => `${from}–${to} / ${formatNumber(total)}`,
            onChange: (page, pageSize) => setQuery((q) => ({ ...q, page, pageSize })),
          }}
        />
      </Card>

      <Modal
        open={editing !== null}
        title={isNew ? 'Yangi foydalanuvchi' : `Tahrirlash: ${editingUser?.username ?? ''}`}
        onCancel={() => setEditing(null)}
        onOk={save}
        okText="Saqlash"
        cancelText="Bekor qilish"
        destroyOnHidden
        width={560}
      >
        <Form form={form} layout="vertical" preserve={false}>
          {isNew && (
            <Form.Item
              name="username"
              label="Login"
              rules={[{ required: true }, { pattern: /^[a-z0-9._-]{3,64}$/, message: "Kichik lotin harflari, raqam, '.', '_' va '-'" }]}
            >
              <Input autoComplete="off" />
            </Form.Item>
          )}
          <Form.Item
            name="password"
            label={isNew ? 'Parol' : "Yangi parol (o'zgartirish uchun)"}
            rules={[{ required: isNew, message: 'Parolni kiriting' }, { min: 12, message: 'Kamida 12 belgi' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="fullName" label="F.I.Sh." rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="orgUnitId" label="Bo'linma" rules={[{ required: true }]}>
            <TreeSelect showSearch treeNodeFilterProp="title" treeData={treeData} />
          </Form.Item>
          <Form.Item name="roleCodes" label="Rollar" rules={[{ required: true, message: 'Kamida bitta rol' }]}>
            <Select mode="multiple" options={roles.map((r) => ({ value: r.code, label: r.name }))} />
          </Form.Item>
          <Form.Item name="sipExtension" label="SIP ichki raqam (UCM6510)" rules={[{ pattern: /^\d{2,16}$/, message: 'Faqat raqamlar' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Telefon">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
            <Input />
          </Form.Item>
          {!isNew && (
            <Form.Item name="isActive" label="Faol" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
