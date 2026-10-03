import { PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form, Input, Modal, Select, Switch, Table, Tag, TreeSelect } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { OrgTreeNode, Page, RoleRow, UserRow } from '../api/types';
import { toTreeSelect } from '../components/orgTree';
import { formatDateTime } from '../format';
import { useAsync } from '../hooks/useAsync';

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

/** Foydalanuvchilar (Kirish boshqaruvi). Parol kamida 12 belgi (TZ 9-bo'lim). */
export default function UsersPage() {
  const { message } = App.useApp();
  const [query, setQuery] = useState({ page: 1, pageSize: 20, search: undefined as string | undefined });
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [form] = Form.useForm<UserForm>();
  const users = useAsync(() => api.get<Page<UserRow>>('/users', { params: query }).then((r) => r.data), [query]);
  const reference = useAsync(
    () =>
      Promise.all([
        api.get<RoleRow[]>('/reference/roles').then((r) => r.data),
        api.get<OrgTreeNode[]>('/org-units/tree').then((r) => r.data),
      ]),
    [],
  );
  const [roles = [], orgTree = []] = reference.data ?? [];
  const treeData = useMemo(() => toTreeSelect(orgTree), [orgTree]);

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

  const columns: ColumnsType<UserRow> = [
    { title: 'Login', dataIndex: 'username', width: 160 },
    { title: 'F.I.Sh.', dataIndex: 'fullName' },
    { title: "Bo'linma", render: (_, u) => u.orgUnit.name, ellipsis: true },
    { title: 'Rollar', render: (_, u) => u.roles.map((r) => <Tag key={r.code}>{r.name}</Tag>) },
    { title: 'SIP', dataIndex: 'sipExtension', width: 80, render: (v: string | null) => v ?? '—' },
    {
      title: 'Holat',
      dataIndex: 'isActive',
      width: 100,
      render: (active: boolean) => (active ? <Tag color="green">Faol</Tag> : <Tag>O'chirilgan</Tag>),
    },
    { title: 'Oxirgi kirish', dataIndex: 'lastLoginAt', width: 150, render: formatDateTime },
  ];

  const isNew = editing === 'new';
  const editingUser = editing !== null && editing !== 'new' ? editing : null;

  return (
    <>
      <div className="page-header">
        <h1>Foydalanuvchilar</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')}>
          Yangi foydalanuvchi
        </Button>
      </div>
      <div className="toolbar">
        <Input.Search
          placeholder="Login yoki F.I.Sh."
          allowClear
          style={{ width: 300 }}
          onSearch={(search) => setQuery((q) => ({ ...q, page: 1, search: search || undefined }))}
        />
      </div>
      {users.error && <Alert type="error" message={users.error} showIcon style={{ marginBottom: 16 }} />}
      <Table
        rowKey="id"
        loading={users.loading}
        columns={columns}
        dataSource={users.data?.items ?? []}
        rowClassName={() => 'clickable-row'}
        onRow={(u) => ({ onClick: () => open(u) })}
        pagination={{
          current: query.page,
          pageSize: query.pageSize,
          total: users.data?.total ?? 0,
          onChange: (page, pageSize) => setQuery((q) => ({ ...q, page, pageSize })),
        }}
      />

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
