import { ArrowDownOutlined, ArrowUpOutlined, CaretRightOutlined, SwapOutlined } from '@ant-design/icons';
import { Alert, Button, Card, DatePicker, Input, Segmented, Select, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { CallDirection, CallResult, CallRow, CallsSummary, Page, Queue } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import RecordingPlayer from '../components/RecordingPlayer';
import ToneTag from '../components/ToneTag';
import { CALL_RESULT_META, DIRECTION_LABELS, P } from '../constants';
import { formatDateTime, formatDuration, formatNumber, formatPhone } from '../format';
import { useAsync } from '../hooks/useAsync';
import './calls.css';

interface Filters {
  number?: string;
  queueId?: number;
  from?: string;
  to?: string;
}

type Outcome = 'all' | 'inbound' | 'outbound' | 'lost';

const OUTCOME_PARAMS: Record<Outcome, { direction?: CallDirection; lost?: boolean }> = {
  all: {},
  inbound: { direction: 'INBOUND' },
  outbound: { direction: 'OUTBOUND' },
  lost: { lost: true },
};

const DIRECTION_ICON: Record<CallDirection, ReactNode> = {
  INBOUND: <ArrowDownOutlined />,
  OUTBOUND: <ArrowUpOutlined />,
  INTERNAL: <SwapOutlined />,
};

/** Qo'ng'iroqlar jurnali (F-REC-04..06): CDR, yozuvni tinglash va qo'ng'iroq narxi. */
export default function CallsPage() {
  const { can } = useAuth();
  const canPlay = can(P.RecordingsPlay);
  const [filters, setFilters] = useState<Filters>({});
  const [outcome, setOutcome] = useState<Outcome>('all');
  const [result, setResult] = useState<CallResult | undefined>();
  const [paging, setPaging] = useState({ page: 1, pageSize: 20 });
  const [playing, setPlaying] = useState<CallRow | null>(null);

  const list = useAsync(
    () =>
      api
        .get<Page<CallRow>>('/calls', { params: { ...filters, ...OUTCOME_PARAMS[outcome], result, ...paging } })
        .then((r) => r.data),
    [filters, outcome, result, paging],
  );
  const summary = useAsync(() => api.get<CallsSummary>('/calls/summary', { params: filters }).then((r) => r.data), [filters]);
  const queues = useAsync(() => api.get<Queue[]>('/reference/queues').then((r) => r.data), []);

  const setFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPaging((p) => ({ ...p, page: 1 }));
  };
  const range: [Dayjs, Dayjs] | null = filters.from && filters.to ? [dayjs(filters.from), dayjs(filters.to)] : null;

  const s = summary.data;
  const chips = s
    ? [
        { v: formatNumber(s.inbound.total), label: 'kiruvchi' },
        { v: formatNumber(s.inbound.byResult.ANSWERED ?? 0), label: 'javob berildi' },
        { v: formatNumber(s.inbound.byResult.ABANDONED ?? 0), label: 'navbatda uzildi' },
        { v: formatNumber(s.inbound.byResult.IVR_ONLY ?? 0), label: 'IVR da yakunlandi' },
        { v: formatNumber(s.inbound.byResult.VOICEMAIL ?? 0), label: 'ovozli xabar' },
        { v: formatDuration(s.avgWaitSeconds), label: "o'rt. kutish" },
        { v: formatDuration(s.avgTalkSeconds), label: "o'rt. suhbat" },
        { v: formatNumber(s.outbound.total), label: `chiquvchi · ${formatNumber(Number(s.outbound.cost))} so'm` },
      ]
    : [];

  const columns: ColumnsType<CallRow> = [
    {
      title: 'Vaqt',
      dataIndex: 'startedAt',
      width: 150,
      render: (v: string) => <span className="mono cell-time">{formatDateTime(v)}</span>,
    },
    {
      title: "Yo'nalish · narx",
      width: 150,
      render: (_, c) => (
        <span className="cell-stack">
          <span className={`call-dir is-${c.direction.toLowerCase()}`}>
            {DIRECTION_ICON[c.direction]} {DIRECTION_LABELS[c.direction]}
          </span>
          <span className="cell-sub">
            {c.charge ? `${formatNumber(Number(c.charge.amount))} so'm` : c.direction === 'INBOUND' ? '1097 · bepul' : '—'}
          </span>
        </span>
      ),
    },
    {
      title: 'Raqam',
      width: 170,
      render: (_, c) => <span className="mono">{formatPhone(c.direction === 'OUTBOUND' ? c.calledNumber : c.callerNumber)}</span>,
    },
    {
      title: 'Operator · navbat',
      render: (_, c) => (
        <span className="cell-stack">
          <span className="cell-ellipsis">{c.agent?.fullName ?? <span className="cell-sub">—</span>}</span>
          <span className="cell-sub cell-ellipsis">{c.queue?.name ?? ''}</span>
        </span>
      ),
    },
    {
      title: 'Davomiylik',
      width: 120,
      render: (_, c) => (
        <span className="cell-stack">
          <span className="mono">{formatDuration(c.talkSeconds)}</span>
          <span className="cell-sub">kutish {formatDuration(c.waitSeconds)}</span>
        </span>
      ),
    },
    {
      title: 'Natija',
      dataIndex: 'result',
      width: 170,
      render: (r: CallResult | null) => (r ? <ToneTag tone={CALL_RESULT_META[r].tone}>{CALL_RESULT_META[r].label}</ToneTag> : '—'),
    },
    {
      title: 'Murojaat',
      width: 160,
      render: (_, c) => (c.ticket ? <Link className="mono" to={`/tickets/${c.ticket.id}`}>{c.ticket.number}</Link> : <span className="cell-sub">—</span>),
    },
    {
      title: <span className="visually-hidden">Yozuv</span>,
      width: 64,
      render: (_, c) => {
        const active = playing?.id === c.id;
        const reason = !canPlay ? "Yozuvni tinglash huquqi yo'q" : !c.recording ? "Yozuv yo'q" : c.recording.deletedAt ? 'Saqlash muddati tugagan' : undefined;
        return (
          <Tooltip title={reason}>
            <Button
              shape="circle"
              type={active ? 'primary' : 'default'}
              icon={<CaretRightOutlined />}
              disabled={!!reason}
              aria-label={reason ?? `${formatDateTime(c.startedAt)} qo'ng'iroq yozuvini tinglash`}
              onClick={() => setPlaying(c)}
            />
          </Tooltip>
        );
      },
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Qo'ng'iroqlar jurnali</h1>
          <span className="page-sub">UCM6510 CDR yozuvlari · audio yozuvlar 3 oy saqlanadi · har bir tinglash audit jurnaliga yoziladi</span>
        </div>
      </div>

      <ul className="calls-summary" aria-label="Davr bo'yicha yig'indi">
        {chips.map((c) => (
          <li key={c.label}>
            <span className="mono calls-summary-value">{c.v}</span>
            <span className="calls-summary-label">{c.label}</span>
          </li>
        ))}
      </ul>

      <div className="calls-filters">
        <Segmented<Outcome>
          value={outcome}
          onChange={(v) => {
            setOutcome(v);
            setPaging((p) => ({ ...p, page: 1 }));
          }}
          options={[
            { value: 'all', label: 'Hammasi' },
            { value: 'inbound', label: 'Kiruvchi' },
            { value: 'outbound', label: 'Chiquvchi' },
            { value: 'lost', label: 'Javobsiz va uzilgan' },
          ]}
        />
        <Input.Search
          allowClear
          className="calls-search"
          placeholder="Telefon raqami"
          aria-label="Telefon raqami bo'yicha qidirish"
          onSearch={(number) => setFilter({ number: number.replace(/[^\d]/g, '') || undefined })}
        />
        <DatePicker.RangePicker
          value={range}
          format="DD.MM.YYYY"
          aria-label="Davr"
          onChange={(dates) => setFilter({ from: dates?.[0]?.startOf('day').toISOString(), to: dates?.[1]?.endOf('day').toISOString() })}
        />
        <Select
          allowClear
          placeholder="Barcha navbatlar"
          aria-label="Navbat"
          style={{ width: 200 }}
          value={filters.queueId}
          onChange={(queueId) => setFilter({ queueId })}
          options={(queues.data ?? []).map((q) => ({ value: q.id, label: `${q.name} (${q.pbxNumber})` }))}
        />
        <Select
          allowClear
          placeholder="Barcha natijalar"
          aria-label="Natija"
          style={{ width: 190 }}
          value={result}
          onChange={(r?: CallResult) => {
            setResult(r);
            setPaging((p) => ({ ...p, page: 1 }));
          }}
          options={Object.entries(CALL_RESULT_META).map(([value, meta]) => ({ value, label: meta.label }))}
        />
      </div>

      {playing && <RecordingPlayer call={playing} onClose={() => setPlaying(null)} />}

      {list.error && <Alert type="error" message={list.error} showIcon style={{ marginBottom: 16 }} />}
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          size="middle"
          loading={list.loading}
          columns={columns}
          dataSource={list.data?.items ?? []}
          scroll={{ x: 1100 }}
          rowClassName={(c) => (playing?.id === c.id ? 'is-selected-row' : '')}
          locale={{ emptyText: "Bu filtr bo'yicha qo'ng'iroq yo'q" }}
          pagination={{
            current: paging.page,
            pageSize: paging.pageSize,
            total: list.data?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (total, [from, to]) => `${from}–${to} / ${formatNumber(total)}`,
            onChange: (page, pageSize) => setPaging({ page, pageSize }),
          }}
        />
      </Card>
      {!canPlay && <p className="page-sub" style={{ marginTop: 8 }}>Yozuvlarni tinglash uchun «Yozuvlarni tinglash» huquqi kerak.</p>}
    </>
  );
}
