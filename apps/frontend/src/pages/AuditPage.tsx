import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Input, Select, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { api, downloadFile, errorMessage } from '../api/client';
import type { AuditCategory, AuditPage as AuditPageData, AuditRow } from '../api/types';
import ToneTag from '../components/ToneTag';
import { formatNumber } from '../format';
import { useAsync } from '../hooks/useAsync';
import './audit.css';

const CATEGORIES: { value: AuditCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'Hammasi' },
  { value: 'security', label: 'Kirish va xavfsizlik' },
  { value: 'tickets', label: 'Murojaatlar' },
  { value: 'recordings', label: 'Yozuvlar' },
  { value: 'settings', label: 'Sozlamalar va rollar' },
  { value: 'export', label: 'Eksport' },
];

type PeriodKey = 'today' | 'yesterday' | '7d' | '30d' | 'all';

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: 'today', label: 'Bugun' },
  { value: 'yesterday', label: 'Kecha' },
  { value: '7d', label: '7 kun' },
  { value: '30d', label: '30 kun' },
  { value: 'all', label: 'Butun davr' },
];

function periodRange(key: PeriodKey): { from?: string; to?: string } {
  const today = dayjs().startOf('day');
  switch (key) {
    case 'today':
      return { from: today.toISOString() };
    case 'yesterday':
      return { from: today.subtract(1, 'day').toISOString(), to: today.toISOString() };
    case '7d':
      return { from: today.subtract(6, 'day').toISOString() };
    case '30d':
      return { from: today.subtract(29, 'day').toISOString() };
    default:
      return {};
  }
}

interface Actor {
  id: number;
  username: string;
  fullName: string;
}

/** Audit jurnali (TZ 9-bo'lim; prototip: Audit loglari artboardi). Yozuvlarni o'zgartirish bazada taqiqlangan. */
export default function AuditPage() {
  const { message } = App.useApp();
  const [category, setCategory] = useState<AuditCategory | 'all'>('all');
  const [search, setSearch] = useState<string>();
  const [actorId, setActorId] = useState<number>();
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [paging, setPaging] = useState({ page: 1, pageSize: 20 });
  const [actorQuery, setActorQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  const params = useMemo(
    () => ({ category: category === 'all' ? undefined : category, search, actorId, ...periodRange(period) }),
    [category, search, actorId, period],
  );
  const list = useAsync(() => api.get<AuditPageData>('/audit', { params: { ...params, ...paging } }).then((r) => r.data), [params, paging]);
  const actors = useAsync(() => api.get<Actor[]>('/audit/actors', { params: { search: actorQuery || undefined } }).then((r) => r.data), [actorQuery]);

  const setFilter = (fn: () => void) => {
    fn();
    setPaging((p) => ({ ...p, page: 1 }));
  };

  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile('/audit/export', params, 'audit.xlsx');
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnsType<AuditRow> = [
    {
      title: 'Vaqt',
      dataIndex: 'createdAt',
      width: 110,
      render: (v: string) => <span className="mono audit-time">{dayjs(v).format(dayjs(v).isSame(dayjs(), 'day') ? 'HH:mm:ss' : 'DD.MM HH:mm')}</span>,
    },
    {
      title: 'Foydalanuvchi',
      width: 250,
      render: (_, a) => (
        <span className="cell-stack">
          <span className="cell-ellipsis">{a.actorName}</span>
          <span className="cell-sub cell-ellipsis">{a.actorSub}</span>
        </span>
      ),
    },
    { title: 'Amal', width: 170, render: (_, a) => <ToneTag tone={a.tone === 'red' ? 'red' : 'grey'}>{a.label}</ToneTag> },
    { title: 'Obyekt', width: 260, render: (_, a) => <span className="cell-ellipsis audit-object">{a.object}</span> },
    { title: 'Tafsilot', ellipsis: true, render: (_, a) => <span title={a.summary}>{a.summary || '—'}</span> },
    { title: 'IP', dataIndex: 'ip', width: 130, render: (v: string | null) => <span className="mono">{v ?? '—'}</span> },
  ];

  const expanded = (a: AuditRow) => (
    <div className="audit-detail">
      <div>
        <span className="audit-detail-title">O'zgarish</span>
        {a.changes.length === 0 ? (
          <span className="cell-sub">Ma'lumot o'zgarmagan (ko'rish yoki kirish amali)</span>
        ) : (
          <table className="audit-diff">
            <tbody>
              {a.changes.map((c) => (
                <tr key={c.field}>
                  <th scope="row">{c.field}</th>
                  <td className="audit-from">{c.from ?? '—'}</td>
                  <td className="audit-to">{c.to ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <dl className="audit-facts">
        <dt>To'liq tavsif</dt>
        <dd>{a.summary || '—'}</dd>
        <dt>Vaqt</dt>
        <dd className="mono">{dayjs(a.createdAt).format('DD.MM.YYYY HH:mm:ss')}</dd>
        <dt>Brauzer</dt>
        <dd>{a.browser ?? '—'}</dd>
        <dt>Amal kodi</dt>
        <dd className="mono">{a.action}</dd>
      </dl>
    </div>
  );

  const shown = list.data?.items.length ?? 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Audit jurnali</h1>
          <span className="page-sub">Kim, qachon, qayerdan va nima qilgani. Yozuvlarni o'zgartirib yoki o'chirib bo'lmaydi.</span>
        </div>
        <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportXlsx()}>
          Eksport
        </Button>
      </div>

      <div className="audit-filters">
        <div className="chip-row" role="group" aria-label="Amal toifasi">
          {CATEGORIES.map((c) => (
            <button key={c.value} type="button" className={`chip${category === c.value ? ' is-active' : ''}`} aria-pressed={category === c.value} onClick={() => setFilter(() => setCategory(c.value))}>
              {c.label}
            </button>
          ))}
        </div>
        <Input.Search
          allowClear
          prefix={<SearchOutlined />}
          className="audit-search"
          placeholder="Foydalanuvchi, obyekt yoki IP"
          aria-label="Audit jurnalida qidirish" data-hotkey="search"
          onSearch={(v) => setFilter(() => setSearch(v.trim() || undefined))}
        />
        <Select
          allowClear
          showSearch
          filterOption={false}
          placeholder="Barcha foydalanuvchilar"
          aria-label="Foydalanuvchi"
          style={{ width: 240 }}
          value={actorId}
          onSearch={setActorQuery}
          onChange={(id?: number) => setFilter(() => setActorId(id))}
          options={(actors.data ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` }))}
        />
        <Select aria-label="Davr" style={{ width: 140 }} value={period} onChange={(v: PeriodKey) => setFilter(() => setPeriod(v))} options={PERIODS} />
      </div>

      {list.error && <Alert type="error" showIcon message={list.error} style={{ marginBottom: 16 }} />}
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          size="middle"
          loading={list.loading}
          columns={columns}
          dataSource={list.data?.items ?? []}
          scroll={{ x: 1100 }}
          expandable={{ expandedRowRender: expanded, expandRowByClick: true }}
          rowClassName={() => 'clickable-row'}
          locale={{ emptyText: "Tanlangan davr va filtr bo'yicha yozuv yo'q" }}
          pagination={{
            current: paging.page,
            pageSize: paging.pageSize,
            total: list.data?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            showTotal: (total) => `Ko'rsatilmoqda ${shown} ta · filtr bo'yicha ${formatNumber(total)} · bugun jami ${formatNumber(list.data?.todayTotal ?? 0)} ta yozuv`,
            onChange: (page, pageSize) => setPaging({ page, pageSize }),
          }}
        />
      </Card>
    </>
  );
}
