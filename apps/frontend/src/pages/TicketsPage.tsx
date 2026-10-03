import { WarningOutlined } from '@ant-design/icons';
import { Alert, Input, Select, Space, Switch, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Page, TicketListItem, TicketStatus } from '../api/types';
import StatusTag from '../components/StatusTag';
import TicketDrawer from '../components/TicketDrawer';
import { STATUS_META } from '../constants';
import { formatDateTime, isOverdue } from '../format';
import { useAsync } from '../hooks/useAsync';

interface Query {
  page: number;
  pageSize: number;
  status?: TicketStatus;
  search?: string;
  overdue?: boolean;
}

const columns: ColumnsType<TicketListItem> = [
  { title: 'Raqam', dataIndex: 'number', width: 160, render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
  { title: 'Mavzu', dataIndex: 'subject', ellipsis: true },
  { title: 'Holat', dataIndex: 'status', width: 150, render: (s: TicketStatus) => <StatusTag status={s} /> },
  { title: 'Toifa', render: (_, t) => t.category?.nameUz ?? '—', ellipsis: true },
  { title: 'Hudud', render: (_, t) => t.region?.nameUz ?? '—', width: 160 },
  { title: "Mas'ul bo'linma", render: (_, t) => t.assignedOrgUnit?.name ?? '—', ellipsis: true },
  {
    title: 'Muddat',
    width: 130,
    render: (_, t) =>
      isOverdue(t.dueAt, t.status) ? (
        <Typography.Text type="danger"><WarningOutlined /> {formatDateTime(t.dueAt).slice(0, 10)}</Typography.Text>
      ) : (
        formatDateTime(t.dueAt).slice(0, 10)
      ),
  },
  { title: 'Qabul qilingan', dataIndex: 'createdAt', width: 150, render: formatDateTime },
];

export default function TicketsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState<Query>({ page: 1, pageSize: 20 });
  const { data, loading, error, reload } = useAsync(
    () => api.get<Page<TicketListItem>>('/tickets', { params: query }).then((r) => r.data),
    [query],
  );

  return (
    <>
      <div className="page-header">
        <h1>Murojaatlar</h1>
      </div>
      <div className="toolbar">
        <Input.Search
          placeholder="Raqam, mavzu yoki telefon"
          allowClear
          style={{ width: 300 }}
          onSearch={(search) => setQuery((q) => ({ ...q, page: 1, search: search || undefined }))}
        />
        <Select
          allowClear
          placeholder="Holat"
          style={{ width: 200 }}
          options={Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))}
          onChange={(status?: TicketStatus) => setQuery((q) => ({ ...q, page: 1, status }))}
        />
        <Space>
          <Switch onChange={(overdue) => setQuery((q) => ({ ...q, page: 1, overdue: overdue || undefined }))} />
          Muddati o'tganlar
        </Space>
      </div>
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={data?.items ?? []}
        rowClassName={() => 'clickable-row'}
        onRow={(record) => ({ onClick: () => navigate(`/tickets/${record.id}`) })}
        pagination={{
          current: query.page,
          pageSize: query.pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `Jami: ${total}`,
          onChange: (page, pageSize) => setQuery((q) => ({ ...q, page, pageSize })),
        }}
      />
      <TicketDrawer id={id ? Number(id) : null} onClose={() => navigate('/tickets')} onChanged={() => void reload()} />
    </>
  );
}
