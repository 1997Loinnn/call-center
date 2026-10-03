import { Alert, DatePicker, Input, Select, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { CallDirection, CallResult, CallRow, Page } from '../api/types';
import { CALL_RESULT_META, DIRECTION_LABELS } from '../constants';
import { formatDateTime, formatDuration } from '../format';
import { useAsync } from '../hooks/useAsync';

interface Query {
  page: number;
  pageSize: number;
  number?: string;
  result?: CallResult;
  from?: string;
  to?: string;
}

const columns: ColumnsType<CallRow> = [
  { title: 'Vaqt', dataIndex: 'startedAt', width: 150, render: formatDateTime },
  { title: "Yo'nalish", dataIndex: 'direction', width: 110, render: (d: CallDirection) => DIRECTION_LABELS[d] },
  { title: 'Raqam', dataIndex: 'callerNumber', width: 160 },
  { title: 'Navbat', render: (_, c) => c.queue?.name ?? '—' },
  { title: 'Operator', render: (_, c) => c.agent?.fullName ?? '—' },
  { title: 'Kutish', dataIndex: 'waitSeconds', align: 'right', width: 90, className: 'num', render: formatDuration },
  { title: 'Suhbat', dataIndex: 'talkSeconds', align: 'right', width: 90, className: 'num', render: formatDuration },
  {
    title: 'Natija',
    dataIndex: 'result',
    width: 150,
    render: (r: CallResult | null) => (r ? <Tag color={CALL_RESULT_META[r].color}>{CALL_RESULT_META[r].label}</Tag> : '—'),
  },
  { title: 'Murojaat', render: (_, c) => (c.ticket ? <Link to={`/tickets/${c.ticket.id}`}>{c.ticket.number}</Link> : '—') },
];

/** Qo'ng'iroqlar jurnali (F-REC-04, F-REC-06). Audio tinglash F-REC-05 bilan qo'shiladi. */
export default function CallsPage() {
  const [query, setQuery] = useState<Query>({ page: 1, pageSize: 20 });
  const { data, loading, error } = useAsync(
    () => api.get<Page<CallRow>>('/calls', { params: query }).then((r) => r.data),
    [query],
  );

  return (
    <>
      <div className="page-header">
        <h1>Qo'ng'iroqlar jurnali</h1>
      </div>
      <div className="toolbar">
        <Input.Search
          placeholder="Telefon raqami"
          allowClear
          style={{ width: 240 }}
          onSearch={(number) => setQuery((q) => ({ ...q, page: 1, number: number || undefined }))}
        />
        <Select
          allowClear
          placeholder="Natija"
          style={{ width: 200 }}
          options={Object.entries(CALL_RESULT_META).map(([value, meta]) => ({ value, label: meta.label }))}
          onChange={(result?: CallResult) => setQuery((q) => ({ ...q, page: 1, result }))}
        />
        <DatePicker.RangePicker
          showTime
          format="DD.MM.YYYY HH:mm"
          onChange={(range) =>
            setQuery((q) => ({
              ...q,
              page: 1,
              from: range?.[0]?.toISOString(),
              to: range?.[1]?.toISOString(),
            }))
          }
        />
      </div>
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
      <Table
        rowKey="id"
        size="middle"
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
