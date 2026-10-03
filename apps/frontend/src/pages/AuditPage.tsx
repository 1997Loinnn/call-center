import { Alert, DatePicker, Select, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { api } from '../api/client';
import type { AuditRow, Page } from '../api/types';
import { formatDateTime } from '../format';
import { useAsync } from '../hooks/useAsync';

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Tizimga kirish',
  'auth.login_failed': 'Muvaffaqiyatsiz kirish',
  'auth.login_locked': 'Bloklangan hisobga urinish',
  'ticket.view': "Murojaatni ko'rish",
  'ticket.create': 'Murojaat yaratish',
  'citizen.view': "Fuqaro kartasini ko'rish",
  'user.create': 'Foydalanuvchi yaratish',
  'user.update': "Foydalanuvchini o'zgartirish",
  'user.reset_password': 'Parolni tiklash',
  'org.create': "Bo'linma yaratish",
  'org.update': "Bo'linmani o'zgartirish",
};

const ACTION_GROUPS = [
  { value: 'auth.', label: 'Kirish' },
  { value: 'ticket.', label: 'Murojaatlar' },
  { value: 'citizen.', label: 'Fuqaro kartasi' },
  { value: 'user.', label: 'Foydalanuvchilar' },
  { value: 'org.', label: 'Tuzilma' },
];

const columns: ColumnsType<AuditRow> = [
  { title: 'Vaqt', dataIndex: 'createdAt', width: 150, render: formatDateTime },
  { title: 'Foydalanuvchi', render: (_, a) => (a.actor ? `${a.actor.fullName} (${a.actor.username})` : '—') },
  { title: 'Amal', dataIndex: 'action', render: (action: string) => ACTION_LABELS[action] ?? action },
  { title: "Ob'ekt", render: (_, a) => (a.entityType ? `${a.entityType} #${a.entityId}` : '—'), width: 180 },
  { title: 'IP', dataIndex: 'ip', width: 140 },
];

/** Audit jurnali (TZ 9-bo'lim). Yozuvlarni o'zgartirish ma'lumotlar bazasi darajasida taqiqlangan. */
export default function AuditPage() {
  const [query, setQuery] = useState<{ page: number; pageSize: number; action?: string; from?: string; to?: string }>({
    page: 1,
    pageSize: 50,
  });
  const { data, loading, error } = useAsync(() => api.get<Page<AuditRow>>('/audit', { params: query }).then((r) => r.data), [query]);

  return (
    <>
      <div className="page-header">
        <h1>Audit jurnali</h1>
      </div>
      <div className="toolbar">
        <Select
          allowClear
          placeholder="Amal turi"
          style={{ width: 220 }}
          options={ACTION_GROUPS}
          onChange={(action?: string) => setQuery((q) => ({ ...q, page: 1, action }))}
        />
        <DatePicker.RangePicker
          showTime
          format="DD.MM.YYYY HH:mm"
          onChange={(range) =>
            setQuery((q) => ({ ...q, page: 1, from: range?.[0]?.toISOString(), to: range?.[1]?.toISOString() }))
          }
        />
      </div>
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={data?.items ?? []}
        pagination={{
          current: query.page,
          pageSize: query.pageSize,
          total: data?.total ?? 0,
          showTotal: (total) => `Jami: ${total}`,
          onChange: (page, pageSize) => setQuery((q) => ({ ...q, page, pageSize })),
        }}
      />
    </>
  );
}
