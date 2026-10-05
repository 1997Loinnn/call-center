import { CheckOutlined, DeleteOutlined, LockOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Checkbox, Empty, Form, Input, Modal, Popconfirm, Segmented, Select, Skeleton, Table, Tag, Tooltip } from 'antd';
import AccessNav from '../components/AccessNav';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { DataScope, RoleRow } from '../api/types';
import { PERMISSION_GROUPS, PERMISSION_LABELS, SCOPE_LABELS, SENSITIVE_PERMISSIONS } from '../constants';
import { useAsync } from '../hooks/useAsync';
import './roles.css';

interface Draft {
  name: string;
  description: string;
  scope: DataScope;
  permissions: string[];
}

interface MatrixRow {
  key: string;
  group?: string;
  code?: string;
}

interface NewRole extends Draft {
  code: string;
  copyFrom?: number;
}

const SCOPE_HINTS: Record<DataScope, string> = {
  OWN: "O'zi yaratgan yoki o'ziga biriktirilgan yozuvlar",
  UNIT: "O'z bo'linmasining yozuvlari",
  UNIT_TREE: "O'z bo'linmasi va barcha quyi bo'linmalar",
  ALL: 'Butun tizim',
};

const toDraft = (r: RoleRow): Draft => ({ name: r.name, description: r.description ?? '', scope: r.scope, permissions: [...r.permissions] });
const sameDraft = (a: Draft, b: Draft) =>
  a.name === b.name && a.description === b.description && a.scope === b.scope && [...a.permissions].sort().join() === [...b.permissions].sort().join();

function PermissionLabel({ code }: { code: string }) {
  return (
    <span className="perm-label">
      {PERMISSION_LABELS[code] ?? code}
      {SENSITIVE_PERMISSIONS.includes(code) && (
        <Tooltip title="Shaxsiy yoki maxfiy ma'lumotga kirish beradi">
          <LockOutlined className="perm-lock" aria-label="Maxfiy ma'lumot" />
        </Tooltip>
      )}
      <span className="perm-code mono">{code}</span>
    </span>
  );
}

/** Rollar va huquqlar (TZ 4-bo'lim): rol tahrirlagichi va huquqlar matritsasi. O'zgarish darhol kuchga kiradi. */
export default function RolesPage() {
  const { message } = App.useApp();
  const [view, setView] = useState<'roles' | 'matrix'>('roles');
  const [version, setVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newForm] = Form.useForm<NewRole>();
  const roles = useAsync(() => api.get<RoleRow[]>('/roles').then((r) => r.data), [version]);
  const list = roles.data ?? [];
  const selected = list.find((r) => r.id === selectedId) ?? list[0];

  useEffect(() => {
    if (selected) setDraft(toDraft(selected));
  }, [selected]);

  const dirty = !!selected && !!draft && !sameDraft(draft, toDraft(selected));

  const save = async () => {
    if (!selected || !draft) return;
    setSaving(true);
    try {
      await api.patch(`/roles/${selected.id}`, draft);
      message.success("Rol saqlandi — o'zgarish darhol kuchga kirdi");
      setVersion((v) => v + 1);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    try {
      await api.delete(`/roles/${selected.id}`);
      message.success("Rol o'chirildi");
      setSelectedId(null);
      setVersion((v) => v + 1);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const create = async () => {
    const values = await newForm.validateFields();
    const source = list.find((r) => r.id === values.copyFrom);
    try {
      const res = await api.post<RoleRow>('/roles', {
        code: values.code,
        name: values.name,
        description: values.description || undefined,
        scope: values.scope,
        permissions: source ? source.permissions : [],
      });
      message.success('Rol yaratildi');
      setCreating(false);
      setSelectedId(res.data.id);
      setView('roles');
      setVersion((v) => v + 1);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const toggle = (code: string, on: boolean) =>
    setDraft((d) => (d ? { ...d, permissions: on ? [...d.permissions, code] : d.permissions.filter((p) => p !== code) } : d));

  // Huquqlar matritsasi: qator — ruxsat (guruh sarlavhalari bilan), ustun — rol
  const matrixRows = useMemo<MatrixRow[]>(
    () => PERMISSION_GROUPS.flatMap((g): MatrixRow[] => [{ key: `g:${g.label}`, group: g.label }, ...g.codes.map((code) => ({ key: code, code }))]),
    [],
  );
  const span = list.length + 1;
  const matrixColumns: ColumnsType<MatrixRow> = [
    {
      title: 'Ruxsat',
      fixed: 'left',
      width: 280,
      onCell: (row) => ({ colSpan: row.group ? span : 1 }),
      render: (_, row) => (row.group ? <span className="matrix-group">{row.group}</span> : <PermissionLabel code={row.code!} />),
    },
    ...list.map((role) => ({
      title: (
        <Tooltip title={`${role.name} · ${SCOPE_LABELS[role.scope]}`}>
          <span className="matrix-role">{role.name}</span>
        </Tooltip>
      ),
      key: role.code,
      width: 120,
      align: 'center' as const,
      onCell: (row: MatrixRow) => ({ colSpan: row.group ? 0 : 1 }),
      render: (_: unknown, row: MatrixRow) =>
        row.code && role.permissions.includes(row.code) ? (
          <CheckOutlined className="matrix-yes" aria-label="Bor" />
        ) : (
          <span className="matrix-no" aria-label="Yo'q">
            —
          </span>
        ),
    })),
  ];

  return (
    <>
      <div className="page-header roles-header">
        <div>
          <h1>Rollar va huquqlar</h1>
          <span className="page-sub">O'zgarishlar foydalanuvchining keyingi so'rovidan kuchga kiradi va audit jurnaliga yoziladi</span>
        </div>
        <div className="roles-actions">
          <AccessNav />
          <Segmented
            value={view}
            onChange={(v) => setView(v as 'roles' | 'matrix')}
            options={[
              { value: 'roles', label: 'Rollar' },
              { value: 'matrix', label: 'Huquqlar matritsasi' },
            ]}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              newForm.resetFields();
              setCreating(true);
            }}
          >
            Yangi rol
          </Button>
        </div>
      </div>
      {roles.error && <Alert type="error" message={roles.error} showIcon style={{ marginBottom: 16 }} />}

      {view === 'matrix' ? (
        <Card size="small" styles={{ body: { padding: 0 } }}>
          <Table<MatrixRow>
            size="small"
            rowKey="key"
            loading={roles.loading}
            columns={matrixColumns}
            dataSource={matrixRows}
            pagination={false}
            scroll={{ x: 280 + list.length * 120 }}
            rowClassName={(row) => (row.group ? 'matrix-group-row' : '')}
          />
        </Card>
      ) : (
        <div className="roles-grid">
          <Card size="small" className="roles-list" title="Rollar">
            {roles.loading && !roles.data ? (
              <Skeleton active />
            ) : (
              list.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`role-item${r.id === selected?.id ? ' is-selected' : ''}`}
                  aria-pressed={r.id === selected?.id}
                  onClick={() => setSelectedId(r.id)}
                >
                  <span className="role-item-text">
                    <span className="role-item-name">{r.name}</span>
                    <span className="role-item-sub">{SCOPE_LABELS[r.scope]}</span>
                  </span>
                  {r.isSystem && <Tag className="role-system">tizim</Tag>}
                  <span className="mono role-item-count" title="Foydalanuvchilar soni">
                    {r.userCount ?? 0}
                  </span>
                </button>
              ))
            )}
          </Card>

          <Card
            size="small"
            className="role-editor"
            title={
              selected ? (
                <span className="role-editor-title">
                  {selected.name} <span className="mono role-code">{selected.code}</span>
                </span>
              ) : (
                'Rol'
              )
            }
            extra={
              selected && !selected.isSystem ? (
                <Popconfirm
                  title="Rol o'chirilsinmi?"
                  description={selected.userCount ? `${selected.userCount} ta foydalanuvchiga biriktirilgan — avval ularni o'tkazing` : undefined}
                  okText="O'chirish"
                  okButtonProps={{ danger: true, disabled: !!selected.userCount }}
                  cancelText="Bekor qilish"
                  onConfirm={() => void remove()}
                >
                  <Button danger size="small" icon={<DeleteOutlined />}>
                    O'chirish
                  </Button>
                </Popconfirm>
              ) : null
            }
          >
            {!selected || !draft ? (
              <Empty description="Rol tanlang" />
            ) : (
              <div className="role-form">
                <div className="role-fields">
                  <label className="field-stack">
                    <span>Nomi</span>
                    <Input value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  </label>
                  <label className="field-stack">
                    <span>Ko'rish doirasi</span>
                    <Select
                      value={draft.scope}
                      onChange={(scope: DataScope) => setDraft({ ...draft, scope })}
                      options={(Object.keys(SCOPE_LABELS) as DataScope[]).map((s) => ({ value: s, label: `${SCOPE_LABELS[s]} (${s})` }))}
                    />
                    <span className="role-hint">{SCOPE_HINTS[draft.scope]}</span>
                  </label>
                </div>
                <label className="field-stack">
                  <span>Tavsif</span>
                  <Input.TextArea rows={2} maxLength={500} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </label>

                {PERMISSION_GROUPS.map((g) => (
                  <fieldset key={g.label} className="perm-group">
                    <legend>{g.label}</legend>
                    <div className="perm-grid">
                      {g.codes.map((code) => (
                        <Checkbox key={code} checked={draft.permissions.includes(code)} onChange={(e) => toggle(code, e.target.checked)}>
                          <PermissionLabel code={code} />
                        </Checkbox>
                      ))}
                    </div>
                  </fieldset>
                ))}

                <div className="role-footer">
                  <Button type="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
                    O'zgarishlarni saqlash
                  </Button>
                  <Button disabled={!dirty} onClick={() => setDraft(toDraft(selected))}>
                    Bekor qilish
                  </Button>
                  {dirty && <span className="role-hint">Saqlanmagan o'zgarishlar bor</span>}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <Modal open={creating} title="Yangi rol" okText="Yaratish" cancelText="Bekor qilish" onOk={() => void create()} onCancel={() => setCreating(false)} destroyOnHidden>
        <Form<NewRole> form={newForm} layout="vertical" preserve={false} initialValues={{ scope: 'OWN' }}>
          <Form.Item
            name="code"
            label="Kod"
            extra="Lotin bosh harflari, raqam va «_»: masalan SHIFT_LEAD"
            rules={[{ required: true, message: 'Kodni kiriting' }, { pattern: /^[A-Z][A-Z0-9_]{2,63}$/, message: 'Masalan: SHIFT_LEAD' }]}
          >
            <Input className="mono" autoComplete="off" />
          </Form.Item>
          <Form.Item name="name" label="Nomi" rules={[{ required: true, message: 'Nomini kiriting' }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="description" label="Tavsif">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
          <Form.Item name="scope" label="Ko'rish doirasi" rules={[{ required: true }]}>
            <Select options={(Object.keys(SCOPE_LABELS) as DataScope[]).map((s) => ({ value: s, label: SCOPE_LABELS[s] }))} />
          </Form.Item>
          <Form.Item name="copyFrom" label="Ruxsatlarni nusxalash" extra="Bo'sh qoldirilsa, rol ruxsatsiz yaratiladi va keyin belgilanadi">
            <Select allowClear placeholder="Rol tanlang" options={list.map((r) => ({ value: r.id, label: r.name }))} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
