import { DownloadOutlined, EditOutlined, FilterOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Badge, Button, Card, DatePicker, Input, Select, Table, TreeSelect } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type {
  Category,
  OrgTreeNode,
  Page,
  Region,
  TicketChannel,
  TicketCounts,
  TicketListItem,
  TicketStatus,
  TicketType,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { toTreeSelect } from '../components/orgTree';
import StatusTag from '../components/StatusTag';
import TicketDrawer from '../components/TicketDrawer';
import { CHANNEL_LABELS, P, STATUS_META, TYPE_LABELS } from '../constants';
import { formatDate, formatDateTime, formatNumber, formatPhone, isOverdue } from '../format';
import { useAsync } from '../hooks/useAsync';
import './tickets.css';

interface Filters {
  type?: TicketType;
  categoryId?: number;
  channel?: TicketChannel;
  regionId?: number;
  assignedOrgUnitId?: number;
  createdFrom?: string;
  createdTo?: string;
  search?: string;
}

type Tab = 'all' | 'overdue' | TicketStatus;

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'Hammasi' },
  { key: 'NEW', label: STATUS_META.NEW.label },
  { key: 'ROUTED', label: STATUS_META.ROUTED.label },
  { key: 'IN_PROGRESS', label: STATUS_META.IN_PROGRESS.label },
  { key: 'ANSWERED', label: STATUS_META.ANSWERED.label },
  { key: 'overdue', label: "Muddati o'tgan" },
  { key: 'CLOSED', label: STATUS_META.CLOSED.label },
  { key: 'RETURNED', label: STATUS_META.RETURNED.label },
];

const tabParams = (tab: Tab) => (tab === 'all' ? {} : tab === 'overdue' ? { overdue: true } : { status: tab });

/** Toifalar daraxti: toifa ostida uning mavzulari (filtrda toifa tanlansa, mavzulari ham kiradi). */
function categoryTree(categories: Category[]) {
  return categories
    .filter((c) => !c.parentId)
    .map((root) => ({
      value: root.id,
      title: root.nameUz,
      children: categories
        .filter((c) => c.parentId === root.id)
        .map((c) => ({ value: c.id, title: `${c.sortOrder}. ${c.nameUz}` })),
    }));
}

/** Murojaatlar ro'yxati (F-CRM-05): holat tablari, filtrlar, eksport va tafsilot paneli. */
export default function TicketsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { message } = App.useApp();
  const [filters, setFilters] = useState<Filters>({});
  const [tab, setTab] = useState<Tab>('all');
  const [paging, setPaging] = useState({ page: 1, pageSize: 20 });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [version, setVersion] = useState(0);

  const query = { ...filters, ...tabParams(tab), ...paging };
  const list = useAsync(
    () => api.get<Page<TicketListItem>>('/tickets', { params: query }).then((r) => r.data),
    [filters, tab, paging, version],
  );
  const counts = useAsync(() => api.get<TicketCounts>('/tickets/counts', { params: filters }).then((r) => r.data), [filters, version]);
  const reference = useAsync(
    () =>
      Promise.all([
        api.get<Category[]>('/reference/categories').then((r) => r.data),
        api.get<Region[]>('/reference/regions').then((r) => r.data),
        api.get<OrgTreeNode[]>('/org-units/tree').then((r) => r.data),
      ]),
    [],
  );
  const [categories = [], regions = [], orgTree = []] = reference.data ?? [];
  const categoryData = useMemo(() => categoryTree(categories), [categories]);
  const orgData = useMemo(() => toTreeSelect(orgTree), [orgTree]);

  const setFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPaging((p) => ({ ...p, page: 1 }));
  };
  const activeFilters = Object.entries(filters).filter(([key, value]) => key !== 'search' && key !== 'createdTo' && value !== undefined).length;
  const range: [Dayjs, Dayjs] | null = filters.createdFrom && filters.createdTo ? [dayjs(filters.createdFrom), dayjs(filters.createdTo)] : null;

  const countOf = (key: Tab): number | undefined => {
    if (!counts.data) return undefined;
    if (key === 'all') return counts.data.total;
    if (key === 'overdue') return counts.data.overdue;
    return counts.data.byStatus[key] ?? 0;
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await api.get<Blob>('/tickets/export', { params: { ...filters, ...tabParams(tab) }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `murojaatlar-${dayjs().format('YYYY-MM-DD')}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const open = (ticket: TicketListItem) => navigate(`/tickets/${ticket.id}`);

  const columns: ColumnsType<TicketListItem> = [
    {
      title: 'Murojaat',
      width: 190,
      render: (_, t) => (
        <span className="cell-stack">
          <span className="mono cell-strong">{t.number}</span>
          <span className="cell-sub">
            {formatDateTime(t.createdAt)} · {CHANNEL_LABELS[t.channel]}
          </span>
        </span>
      ),
    },
    {
      title: 'Fuqaro',
      width: 200,
      render: (_, t) =>
        t.citizen ? (
          <span className="cell-stack">
            <span className="cell-ellipsis">{t.citizen.fullName ?? "Ism ko'rsatilmagan"}</span>
            <span className="mono cell-sub">{formatPhone(t.citizen.phone)}</span>
          </span>
        ) : (
          <span className="cell-sub">{t.isAnonymous ? 'Anonim' : '—'}</span>
        ),
    },
    {
      title: 'Mavzu va turi',
      render: (_, t) => (
        <span className="cell-stack">
          <span className="cell-ellipsis cell-strong">{t.subject}</span>
          <span className="cell-sub cell-ellipsis">
            {TYPE_LABELS[t.type]}
            {t.category && t.category.nameUz !== t.subject ? ` · ${t.category.nameUz}` : ''}
          </span>
        </span>
      ),
    },
    { title: 'Holat', dataIndex: 'status', width: 170, render: (s: TicketStatus) => <StatusTag status={s} /> },
    {
      title: "Asosiy mas'ul",
      width: 230,
      render: (_, t) => (
        <span className="cell-stack">
          <span className="cell-ellipsis">{t.assignedOrgUnit?.name ?? <span className="cell-sub">Tayinlanmagan</span>}</span>
          {t.assignee && <span className="cell-sub cell-ellipsis">{t.assignee.fullName}</span>}
        </span>
      ),
    },
    {
      title: 'Ijro muddati',
      width: 130,
      render: (_, t) =>
        isOverdue(t.dueAt, t.status) ? (
          <span className="cell-stack cell-danger">
            <span>{formatDate(t.dueAt)}</span>
            <span className="cell-sub-danger">muddati o'tgan</span>
          </span>
        ) : (
          formatDate(t.dueAt)
        ),
    },
    {
      title: <span className="visually-hidden">Amallar</span>,
      width: 56,
      render: (_, t) => (
        <Button
          type="text"
          icon={<EditOutlined />}
          aria-label={`${t.number} murojaatini ochish`}
          onClick={(e) => {
            e.stopPropagation();
            open(t);
          }}
        />
      ),
    },
  ];

  return (
    <>
      <div className="page-header tickets-header">
        <div>
          <h1>Murojaatlar</h1>
          <span className="page-sub">Telefon, ovozli xabar, Telegram, veb-chat va e-pochta orqali kelgan murojaatlar</span>
        </div>
        <div className="tickets-actions">
          <Input.Search
            allowClear
            placeholder="Raqam, mavzu yoki telefon"
            aria-label="Murojaatlarni qidirish"
            style={{ width: 280 }}
            onSearch={(search) => setFilter({ search: search || undefined })}
          />
          <Badge count={activeFilters} size="small">
            <Button icon={<FilterOutlined />} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)} type={filtersOpen ? 'primary' : 'default'} ghost={filtersOpen}>
              Filtrlar
            </Button>
          </Badge>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportCsv()}>
            Eksport (Excel)
          </Button>
          {can(P.TicketsCreate) && (
            <Link to="/operator">
              <Button type="primary" icon={<PlusOutlined />}>
                Yangi murojaat
              </Button>
            </Link>
          )}
        </div>
      </div>

      {filtersOpen && (
        <Card size="small" className="tickets-filters">
          <div className="filter-grid">
            <label className="filter-field">
              <span>Murojaat turi</span>
              <Select
                allowClear
                placeholder="Barcha turlar"
                value={filters.type}
                onChange={(type) => setFilter({ type })}
                options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </label>
            <label className="filter-field">
              <span>Toifa yoki mavzu</span>
              <TreeSelect
                allowClear
                showSearch
                treeNodeFilterProp="title"
                placeholder="Barcha toifalar"
                value={filters.categoryId}
                onChange={(categoryId) => setFilter({ categoryId })}
                treeData={categoryData}
              />
            </label>
            <label className="filter-field">
              <span>Kanal</span>
              <Select
                allowClear
                placeholder="Barcha kanallar"
                value={filters.channel}
                onChange={(channel) => setFilter({ channel })}
                options={Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </label>
            <label className="filter-field">
              <span>Hudud</span>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Barcha hududlar"
                value={filters.regionId}
                onChange={(regionId) => setFilter({ regionId })}
                options={regions.map((r) => ({ value: r.id, label: r.nameUz }))}
              />
            </label>
            <label className="filter-field">
              <span>Asosiy mas'ul (bo'linma)</span>
              <TreeSelect
                allowClear
                showSearch
                treeNodeFilterProp="title"
                placeholder="Barcha bo'linmalar"
                value={filters.assignedOrgUnitId}
                onChange={(assignedOrgUnitId) => setFilter({ assignedOrgUnitId })}
                treeData={orgData}
              />
            </label>
            <label className="filter-field">
              <span>Qabul qilingan sana</span>
              <DatePicker.RangePicker
                value={range}
                format="DD.MM.YYYY"
                onChange={(dates) =>
                  setFilter({
                    createdFrom: dates?.[0]?.startOf('day').toISOString(),
                    createdTo: dates?.[1]?.endOf('day').toISOString(),
                  })
                }
              />
            </label>
          </div>
          <div className="filter-footer">
            <Button
              disabled={activeFilters === 0}
              onClick={() => {
                setFilters((f) => ({ search: f.search }));
                setPaging((p) => ({ ...p, page: 1 }));
              }}
            >
              Filtrlarni tozalash
            </Button>
          </div>
        </Card>
      )}

      <div className="status-tabs" role="group" aria-label="Holat bo'yicha">
        {TABS.map((t) => {
          const n = countOf(t.key);
          return (
            <button
              key={t.key}
              type="button"
              className={`status-tab${tab === t.key ? ' is-active' : ''}${t.key === 'overdue' ? ' is-danger' : ''}`}
              aria-pressed={tab === t.key}
              onClick={() => {
                setTab(t.key);
                setPaging((p) => ({ ...p, page: 1 }));
              }}
            >
              {t.label}
              {n !== undefined && <span className="status-tab-count mono">{formatNumber(n)}</span>}
            </button>
          );
        })}
      </div>

      {list.error && <Alert type="error" message={list.error} showIcon style={{ marginBottom: 16 }} />}
      <Card size="small" className="tickets-table" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          size="middle"
          loading={list.loading}
          columns={columns}
          dataSource={list.data?.items ?? []}
          scroll={{ x: 1100 }}
          rowClassName={(t) => `clickable-row${String(t.id) === id ? ' is-selected-row' : ''}`}
          onRow={(record) => ({ onClick: () => open(record) })}
          locale={{ emptyText: "Bu filtr bo'yicha murojaat yo'q" }}
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
      <TicketDrawer id={id ? Number(id) : null} onClose={() => navigate('/tickets')} onChanged={() => setVersion((v) => v + 1)} />
    </>
  );
}
