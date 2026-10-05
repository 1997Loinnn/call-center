import { DownloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Empty, Segmented, Skeleton, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadFile, errorMessage } from '../api/client';
import type { AnalyticsData, ExportTemplatesResponse, PeriodKey } from '../api/types';
import BarChart, { ChartTable, type BarDatum } from '../components/charts/BarChart';
import KpiCard, { type KpiStatus } from '../components/KpiCard';
import { FORMAT_CLASS } from '../constants';
import { formatDuration, formatNumber } from '../format';
import { useAsync } from '../hooks/useAsync';
import './analytics.css';

type Operator = AnalyticsData['operators'][number];

const PERIODS: { value: PeriodKey; label: string; caption: string }[] = [
  { value: 'today', label: 'Bugun', caption: 'bugun' },
  { value: '7d', label: '7 kun', caption: '7 kun' },
  { value: '30d', label: '30 kun', caption: '30 kun' },
];

const pct = (v: number | null) => (v === null ? '—' : `${String(v).replace('.', ',')}%`);
const som = (v: number) => `${formatNumber(Math.round(v))} so'm`;

/** Analitika va hisobotlar (F-REP-01..04, F-BIL-04; prototip: Analitika artboardi). */
export default function AnalyticsPage() {
  const { message } = App.useApp();
  const [period, setPeriod] = useState<PeriodKey>('7d');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [busy, setBusy] = useState<string | null>(null);
  const data = useAsync(() => api.get<AnalyticsData>('/reports/analytics', { params: { period } }).then((r) => r.data), [period]);
  const templates = useAsync(() => api.get<ExportTemplatesResponse>('/crm/export-templates').then((r) => r.data), []);

  const d = data.data;
  const caption = PERIODS.find((p) => p.value === period)!.caption;
  const range = d ? { from: d.period.from, to: d.period.to } : {};

  const download = async (key: string, run: () => Promise<void>) => {
    setBusy(key);
    try {
      await run();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const sl = d?.serviceLevel;
  const answeredStatus: KpiStatus | undefined = d && sl && d.calls.slaPercent !== null ? (d.calls.slaPercent >= sl.targetPercent ? 'good' : 'warn') : undefined;
  const waitStatus: KpiStatus | undefined = d && sl ? (d.calls.avgWaitSeconds <= sl.avgWaitTargetSeconds ? 'good' : 'warn') : undefined;

  const series: BarDatum[] = (d?.inboundSeries ?? []).map((b, i, all) => ({
    key: b.key,
    label: b.label,
    value: b.total,
    hint: `javob berildi ${formatNumber(b.answered)} · uzildi ${formatNumber(b.lost)}`,
    partial: i === all.length - 1,
  }));
  const busiest = series.reduce<BarDatum | null>((best, b) => (!best || b.value > best.value ? b : best), null);
  const isHourly = d?.period.bucket === 'hour';
  const topMax = Math.max(1, ...(d?.topTopics ?? []).map((t) => t.count));

  const operatorColumns: ColumnsType<Operator> = [
    {
      title: 'Operator',
      render: (_, o) => (
        <span className="cell-stack">
          <span className="cell-strong">{o.fullName}</span>
          {o.sipExtension && <span className="cell-sub mono">SIP {o.sipExtension}</span>}
        </span>
      ),
    },
    { title: "Qo'ng'iroq", dataIndex: 'calls', align: 'right', className: 'mono', render: (v: number) => formatNumber(v), sorter: (a, b) => a.calls - b.calls, defaultSortOrder: 'descend' },
    { title: "O'rt. suhbat", dataIndex: 'avgTalkSeconds', align: 'right', className: 'mono', render: (v: number) => formatDuration(v), sorter: (a, b) => a.avgTalkSeconds - b.avgTalkSeconds },
    { title: 'Murojaat', dataIndex: 'tickets', align: 'right', className: 'mono', render: (v: number) => formatNumber(v), sorter: (a, b) => a.tickets - b.tickets },
    {
      title: 'Joyida hal',
      dataIndex: 'resolvedOnSpotPercent',
      align: 'right',
      className: 'mono',
      render: pct,
      sorter: (a, b) => (a.resolvedOnSpotPercent ?? -1) - (b.resolvedOnSpotPercent ?? -1),
    },
    {
      title: 'Baho',
      dataIndex: 'rating',
      align: 'right',
      className: 'mono',
      render: (v: number | null) => (v === null ? '—' : String(v).replace('.', ',')),
      sorter: (a, b) => (a.rating ?? -1) - (b.rating ?? -1),
    },
  ];

  const readyReports = (templates.data?.templates ?? []).filter((t) => t.isActive && t.source !== 'ticket_answer');

  return (
    <>
      <div className="page-header analytics-header">
        <div>
          <h1>Analitika va hisobotlar</h1>
          <span className="page-sub">Qo'ng'iroqlar, murojaatlar, operatorlar samaradorligi va xarajatlar · sizning ko'rish doirangiz bo'yicha</span>
        </div>
        <div className="analytics-actions">
          <Segmented<PeriodKey> value={period} onChange={setPeriod} options={PERIODS.map(({ value, label }) => ({ value, label }))} />
          <Button
            icon={<DownloadOutlined />}
            loading={busy === 'analytics'}
            onClick={() => void download('analytics', () => downloadFile('/reports/analytics/export', { period }, 'analitika.xlsx'))}
          >
            Eksport
          </Button>
        </div>
      </div>

      {data.error && <Alert type="error" showIcon message={data.error} style={{ marginBottom: 16 }} />}
      {!d ? (
        <Skeleton active />
      ) : (
        <>
          <div className="kpi-cards">
            <KpiCard label="Kiruvchi qo'ng'iroqlar" value={formatNumber(d.calls.inbound)} sub={caption} />
            <KpiCard
              label="Javob berilgan"
              value={pct(d.calls.answeredPercent)}
              status={answeredStatus}
              sub={
                <Tooltip title={`${sl?.answerWithinSeconds} soniyada javob berilganlar ulushi (javob berilgan + uzilganlarga nisbatan). Kutish vaqti qo'ng'iroq boshlanishidan javobgacha, IVR bilan birga hisoblanadi.`}>
                  <span>
                    xizmat darajasi {pct(d.calls.slaPercent)} · maqsad {sl?.targetPercent}% <InfoCircleOutlined />
                  </span>
                </Tooltip>
              }
            />
            <KpiCard label="O'rtacha kutish" value={formatDuration(d.calls.avgWaitSeconds)} status={waitStatus} sub={`maqsad ≤ ${formatDuration(sl?.avgWaitTargetSeconds ?? 0)}`} />
            <KpiCard label="O'rtacha suhbat" value={formatDuration(d.calls.avgTalkSeconds)} sub="AHT" />
            <KpiCard label="Murojaatlar yaratildi" value={formatNumber(d.tickets.created)} sub="barcha kanallar" />
            <KpiCard label="Joyida hal qilindi" value={pct(d.tickets.resolvedOnSpotPercent)} sub={`${formatNumber(d.tickets.resolvedOnSpot)} ta murojaat`} />
          </div>

          <div className="analytics-grid">
            <Card
              size="small"
              title={
                <>
                  Kiruvchi qo'ng'iroqlar {isHourly ? "soatlar bo'yicha" : "kunlar bo'yicha"}
                  <span className="card-sub">
                    Jami {formatNumber(d.calls.inbound)} ta{busiest && busiest.value > 0 ? ` · eng band: ${busiest.label}${isHourly ? ':00' : ''} (${formatNumber(busiest.value)} ta)` : ''}
                  </span>
                </>
              }
              extra={
                <Segmented
                  size="small"
                  value={view}
                  onChange={(v) => setView(v as 'chart' | 'table')}
                  options={[
                    { value: 'chart', label: 'Grafik' },
                    { value: 'table', label: 'Jadval' },
                  ]}
                />
              }
            >
              {view === 'chart' ? (
                <BarChart
                  data={series}
                  ariaLabel={`Kiruvchi qo'ng'iroqlar ${isHourly ? 'soatlar' : 'kunlar'} bo'yicha: jami ${d.calls.inbound} ta${busiest ? `, eng ko'p ${busiest.label} — ${busiest.value} ta` : ''}`}
                />
              ) : (
                <ChartTable data={series} labelTitle={isHourly ? 'Soat' : 'Sana'} valueTitle="Kiruvchi" />
              )}
            </Card>

            <Card size="small" title="Eng ko'p so'ralgan mavzular">
              {d.topTopics.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bu davrda murojaat yo'q" />
              ) : (
                <ol className="rank-list">
                  {d.topTopics.map((t) => (
                    <li key={t.categoryId}>
                      <div className="rank-head">
                        <span className="rank-name" title={t.parent ? `${t.parent} · ${t.name}` : t.name}>
                          {t.number !== null && <span className="rank-no">{t.number}</span>}
                          {t.name}
                        </span>
                        <span className="rank-value">{formatNumber(t.count)}</span>
                      </div>
                      <div className="rank-track" aria-hidden>
                        <div className="rank-fill" style={{ width: `${(t.count / topMax) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card size="small" title="Operatorlar samaradorligi" styles={{ body: { padding: 0 } }} className="analytics-operators">
              <Table
                rowKey="id"
                size="small"
                columns={operatorColumns}
                dataSource={d.operators}
                pagination={d.operators.length > 12 ? { pageSize: 12, size: 'small', showSizeChanger: false } : false}
                scroll={{ x: 640 }}
                locale={{ emptyText: "Bu davrda operatorlar faoliyati yo'q" }}
              />
              <p className="page-sub analytics-note">Baho — supervisorning suhbat sifatini baholashi (5 ballik). Joyida hal — operator yaratgan murojaatlardan qabul paytida yopilganlari.</p>
            </Card>

            <div className="analytics-side">
              <Card
                size="small"
                title={
                  <>
                    Qo'ng'iroqlar xarajati (billing)
                    <span className="card-sub">Chiquvchi qo'ng'iroqlar tarif jadvali bo'yicha</span>
                  </>
                }
                extra={<Link to="/billing">Batafsil</Link>}
              >
                <table className="billing-table">
                  <tbody>
                    {d.billing.rows.map((r) => (
                      <tr key={r.direction}>
                        <th scope="row">{r.label}</th>
                        <td className="mono">{formatNumber(r.minutes)} daq</td>
                        <td className="mono">{r.amount > 0 ? som(r.amount) : '—'}</td>
                      </tr>
                    ))}
                    <tr>
                      <th scope="row">Kiruvchi 1097</th>
                      <td className="mono">{formatNumber(d.billing.inbound.minutes)} daq</td>
                      <td className="mono">—</td>
                    </tr>
                    <tr className="billing-total">
                      <th scope="row">Jami</th>
                      <td />
                      <td className="mono">{som(d.billing.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </Card>

              <Card size="small" title="Tayyor hisobotlar" extra={<Link to="/crm/export">Shablonlar</Link>}>
                {templates.error && <Alert type="warning" showIcon message={templates.error} />}
                <ul className="report-list">
                  {readyReports.map((t) => (
                    <li key={t.id}>
                      <span className={`fmt-badge ${FORMAT_CLASS[t.format]}`}>{t.format}</span>
                      <span className="report-name">{t.name}</span>
                      <Tooltip title="Tanlangan davr bo'yicha yuklab olish">
                        <Button
                          size="small"
                          icon={<DownloadOutlined />}
                          loading={busy === `tpl-${t.id}`}
                          aria-label={`${t.name}: yuklab olish`}
                          onClick={() =>
                            void download(`tpl-${t.id}`, () => downloadFile(`/reports/templates/${t.id}/download`, range, `${t.code}.${t.format.toLowerCase()}`))
                          }
                        />
                      </Tooltip>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
