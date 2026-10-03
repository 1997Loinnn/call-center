import { Alert, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../api/client';
import type { DataScope, RoleRow } from '../api/types';
import { PERMISSION_LABELS, SCOPE_LABELS } from '../constants';
import { useAsync } from '../hooks/useAsync';

const columns: ColumnsType<RoleRow> = [
  {
    title: 'Rol',
    width: 260,
    render: (_, r) => (
      <>
        <Typography.Text strong>{r.name}</Typography.Text>
        <div>
          <Typography.Text type="secondary">{r.code}</Typography.Text>
        </div>
      </>
    ),
  },
  { title: "Ko'rish doirasi", dataIndex: 'scope', width: 220, render: (s: DataScope) => SCOPE_LABELS[s] },
  {
    title: 'Ruxsatlar',
    dataIndex: 'permissions',
    render: (permissions: string[]) => permissions.map((p) => <Tag key={p}>{PERMISSION_LABELS[p] ?? p}</Tag>),
  },
  { title: 'Tavsif', dataIndex: 'description', width: 280 },
];

/** Rollar va huquqlar (TZ 4-bo'lim). Rollarni tahrirlash 2-oy rejasida. */
export default function RolesPage() {
  const { data, loading, error } = useAsync(() => api.get<RoleRow[]>('/reference/roles').then((r) => r.data), []);
  return (
    <>
      <div className="page-header">
        <h1>Rollar va huquqlar</h1>
      </div>
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
      <Table rowKey="id" loading={loading} columns={columns} dataSource={data ?? []} pagination={false} />
    </>
  );
}
