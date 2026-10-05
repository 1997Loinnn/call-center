import { CustomerServiceOutlined, DesktopOutlined, WarningOutlined } from '@ant-design/icons';
import { Alert, App, Avatar, Button, Card, Empty, Select, Skeleton, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { AgentStatus, LiveAgent, LiveData } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import BarChart, { type BarDatum } from '../components/charts/BarChart';
import KpiCard from '../components/KpiCard';
import ToneTag from '../components/ToneTag';
import { AGENT_STATUS_META, P } from '../constants';
import { formatClock, formatDuration, formatNumber } from '../format';
import { useAsync } from '../hooks/useAsync';
import { useSocketEvent } from '../realtime/socket';
import './live.css';

const REFRESH_MS = 5_000;
// Holat filtrlari (prototip tartibida); "Yakunlash" faqat shunday operator bo'lsa chiqadi
const FILTERS: (AgentStatus | 'ALL')[] = ['ALL', 'ON_CALL', 'READY', 'WRAP_UP', 'BREAK', 'OFFLINE'];
// Shu davomiylikdan oshsa "Holatda" ustuni ajratib ko'rsatiladi
const LONG_STATE: Partial<Record<AgentStatus, number>> = { ON_CALL: 7 * 60, BREAK: 15 * 60, WRAP_UP: 3 * 60 };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

/** Jonli holat (F-MON-01, F-MON-02; prototip: Monitoring artboardi). Har 5 soniyada va operator holati o'zgarganda yangilanadi. */
export default function LivePage() {
  const { message } = App.useApp();
  const { user, can } = useAuth();
  const [queue, setQueue] = useState<string>();
  const [filter, setFilter] = useState<AgentStatus | 'ALL'>('ALL');
  const [now, setNow] = useState(Date.now());
  const live = useAsync(() => api.get<LiveData>('/monitoring/live', { params: { queue } }).then((r) => r.data), [queue]);

  useEffect(() => {
    const refresh = setInterval(() => void live.reload(), REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [live.reload]);
  useSocketEvent('agent.status', () => void live.reload());

  const d = live.data;
  // Server va brauzer soati farqi: davomiyliklar server vaqti bo'yicha hisoblanadi
  const offset = useMemo(() => (d ? Date.now() - dayjs(d.updatedAt).valueOf() : 0), [d]);
  const secondsSince = (iso: string | null) => (iso ? Math.max(0, (now - offset - dayjs(iso).valueOf()) / 1000) : 0);

  const listen = async (agent: LiveAgent) => {
    try {
      await api.post(`/monitoring/agents/${agent.id}/listen`);
      message.success(`${agent.fullName} suhbati telefoningizga ulanmoqda`);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const canListen = can(P.TelephonyUse) && !!user?.sipExtension;
  const agents = (d?.agents ?? []).filter((a) => filter === 'ALL' || a.status === filter);
  const count = (s: AgentStatus | 'ALL') => (s === 'ALL' ? (d?.agents.length ?? 0) : (d?.kpi.byStatus[s] ?? 0));

  const columns: ColumnsType<LiveAgent> = [
    {
      title: 'Operator',
      render: (_, a) => (
        <span className="user-cell">
          <Avatar size={32} className="user-avatar">
            {initials(a.fullName)}
          </Avatar>
          <span className="cell-ellipsis">{a.fullName}</span>
        </span>
      ),
    },
    { title: 'SIP', dataIndex: 'sipExtension', width: 80, render: (v: string) => <span className="mono">{v}</span> },
    {
      title: 'Holat',
      width: 150,
      render: (_, a) => (
        <Tooltip title={a.reason ?? undefined}>
          <span>
            <ToneTag tone={AGENT_STATUS_META[a.status].tone}>{AGENT_STATUS_META[a.status].label}</ToneTag>
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'Holatda',
      width: 110,
      render: (_, a) => {
        const seconds = secondsSince(a.since);
        const long = (LONG_STATE[a.status] ?? Infinity) < seconds;
        return a.since ? <span className={`mono${long ? ' live-long' : ''}`}>{formatClock(seconds)}</span> : <span className="cell-sub">—</span>;
      },
    },
    { title: 'Bugun', dataIndex: 'callsToday', width: 80, align: 'right', render: (v: number) => <span className="mono">{v}</span> },
    { title: "O'rt. suhbat", dataIndex: 'avgTalkSeconds', width: 110, align: 'right', render: (v: number) => <span className="mono">{v ? formatDuration(v) : '—'}</span> },
    {
      title: <span className="visually-hidden">Amallar</span>,
      width: 130,
      render: (_, a) =>
        a.status === 'ON_CALL' ? (
          <Tooltip title={canListen ? 'Suhbatni o\'z telefoningizda tinglash' : 'Tinglash uchun softfon huquqi va SIP raqam kerak'}>
            <Button size="small" icon={<CustomerServiceOutlined />} disabled={!canListen} onClick={() => void listen(a)}>
              Tinglash
            </Button>
          </Tooltip>
        ) : null,
    },
  ];

  const sl = d?.serviceLevel;
  const k = d?.kpi;
  const hourly: BarDatum[] = (d?.hourly ?? []).map((b) => ({
    key: b.key,
    label: b.label,
    value: b.total,
    hint: `javob berildi ${b.answered} · uzildi ${b.lost}`,
    partial: Number(b.key) === new Date(now).getHours(),
  }));
  const busiest = hourly.reduce<BarDatum | null>((best, b) => (!best || b.value > best.value ? b : best), null);
  const pbxLabel = d?.driver === 'mock' ? 'Test PBX (mock)' : 'UCM6510 AMI hodisalari';

  return (
    <>
      <div className="page-header live-header">
        <div>
          <h1>Jonli holat</h1>
          <span className="page-sub">
            Real vaqt · {pbxLabel}
            {d ? ` · oxirgi: ${dayjs(d.updatedAt).format('HH:mm:ss')}` : ''}
          </span>
        </div>
        <Select
          allowClear
          placeholder="Barcha navbatlar"
          aria-label="Navbat"
          style={{ width: 240 }}
          value={queue}
          onChange={setQueue}
          options={(d?.queues ?? []).map((q) => ({ value: q.queue, label: `${q.name} (${q.queue})` }))}
        />
        <Link to="/wall" className="live-wall-link">
          <Button icon={<DesktopOutlined />}>Katta ekran</Button>
        </Link>
      </div>

      {live.error && <Alert type="error" showIcon message={live.error} style={{ marginBottom: 16 }} />}
      {!d || !k || !sl ? (
        <Skeleton active />
      ) : (
        <>
          <div className="kpi-cards">
            <KpiCard
              label="Navbatda"
              value={d.queueSupported ? formatNumber(k.waiting) : '—'}
              sub={d.queueSupported ? `Eng uzoq kutish: ${formatDuration(k.longestWaitSeconds)}` : 'PBX navbat holatini bermayapti'}
            />
            <KpiCard
              label="O'rtacha kutish"
              value={formatDuration(k.avgWaitSeconds)}
              status={k.avgWaitSeconds <= sl.avgWaitTargetSeconds ? 'good' : 'warn'}
              sub={`Maqsad ≤ ${formatDuration(sl.avgWaitTargetSeconds)} — ${k.avgWaitSeconds <= sl.avgWaitTargetSeconds ? 'bajarilmoqda' : 'yuqori'}`}
            />
            <KpiCard
              label={`SLA (${sl.answerWithinSeconds} soniyada javob)`}
              value={k.slaPercent === null ? '—' : `${Math.round(k.slaPercent)}%`}
              status={k.slaPercent === null ? undefined : k.slaPercent >= sl.targetPercent ? 'good' : 'warn'}
              sub={`Maqsad ${sl.targetPercent}% — ${k.slaPercent !== null && k.slaPercent >= sl.targetPercent ? 'bajarilmoqda' : 'bajarilmayapti'}`}
            />
            <KpiCard
              label="Bugun kelgan"
              value={formatNumber(k.inbound)}
              sub={`Javobsiz: ${formatNumber(k.lost)}${k.offered ? ` (${Math.round((k.lost / k.offered) * 100)}%)` : ''}`}
            />
            <KpiCard
              label="Operatorlar onlayn"
              value={
                <>
                  {k.agentsOnline} <span className="kpi-card-of">/ {k.agentsTotal}</span>
                </>
              }
              sub={`Suhbatda ${k.byStatus.ON_CALL} · Bo'sh ${k.byStatus.READY} · Tanaffus ${k.byStatus.BREAK}`}
            />
          </div>

          <div className="live-grid">
            <Card
              size="small"
              title="Operatorlar"
              className="live-agents"
              extra={
                <div className="chip-row" role="group" aria-label="Holat bo'yicha filtr">
                  {FILTERS.filter((s) => s !== 'WRAP_UP' || count('WRAP_UP') > 0).map((s) => (
                    <button key={s} type="button" className={`chip${filter === s ? ' is-active' : ''}`} aria-pressed={filter === s} onClick={() => setFilter(s)}>
                      {s === 'ALL' ? 'Hammasi' : AGENT_STATUS_META[s].label} <span className="chip-count">{count(s)}</span>
                    </button>
                  ))}
                </div>
              }
              styles={{ body: { padding: 0 } }}
            >
              <Table
                rowKey="id"
                size="middle"
                columns={columns}
                dataSource={agents}
                pagination={agents.length > 15 ? { pageSize: 15, size: 'small', showSizeChanger: false } : false}
                scroll={{ x: 720 }}
                locale={{ emptyText: 'Bu holatda operator yo\'q' }}
              />
            </Card>

            <div className="live-side">
              <Card size="small" title="Navbatdagi qo'ng'iroqlar" extra={d.queueSupported && <span className="cell-sub">{k.waiting} ta</span>}>
                {!d.queueSupported ? (
                  <p className="page-sub">UCM6510 AMI ulangach navbatdagi qo'ng'iroqlar shu yerda real vaqtda ko'rinadi.</p>
                ) : d.waiting.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Navbat bo'sh" />
                ) : (
                  <ul className="queue-list">
                    {d.waiting.map((w, i) => {
                      const wait = w.waitSeconds + (now - offset - dayjs(d.updatedAt).valueOf()) / 1000;
                      return (
                        <li key={`${w.number}-${i}`}>
                          <span className="cell-stack">
                            <span className="mono">{w.number}</span>
                            <span className="cell-sub">
                              {w.queueName} · {w.queue}
                            </span>
                          </span>
                          {wait > sl.answerWithinSeconds * 3 && (
                            <span className="queue-long">
                              <WarningOutlined /> Uzoq kutish
                            </span>
                          )}
                          <span className="mono queue-wait">{formatDuration(Math.floor(wait))}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card
                size="small"
                title={
                  <>
                    Soatlik kiruvchi qo'ng'iroqlar
                    <span className="card-sub">
                      Bugun jami {formatNumber(k.inbound)} ta{busiest && busiest.value > 0 ? ` · eng band soat ${busiest.label}:00 (${busiest.value} ta)` : ''}
                    </span>
                  </>
                }
              >
                <BarChart data={hourly} height={200} ariaLabel={`Bugungi kiruvchi qo'ng'iroqlar soatlar bo'yicha, jami ${k.inbound} ta`} />
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
