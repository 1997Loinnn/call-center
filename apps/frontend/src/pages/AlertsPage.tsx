import { CheckCircleOutlined, ExclamationCircleOutlined, SearchOutlined, WarningOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Checkbox, Empty, Input, InputNumber, Pagination, Segmented, Skeleton } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { AlertCounts, AlertNotify, AlertRow, AlertRuleRow, AlertSeverity, Page } from '../api/types';
import ToneTag from '../components/ToneTag';
import { formatNumber } from '../format';
import { useAsync } from '../hooks/useAsync';
import { useSocketEvent } from '../realtime/socket';
import type { Tone } from '../theme';
import './alerts.css';

const SEVERITY: Record<AlertSeverity, { label: string; tone: Tone }> = {
  CRITICAL: { label: 'Kritik', tone: 'red' },
  WARNING: { label: 'Ogohlantirish', tone: 'amber' },
  INFO: { label: "Ma'lumot", tone: 'blue' },
};

// Limit qatoridagi izoh (prototip: "kutish >", "navbatda ≥" ...)
const PREFIX: Record<string, string> = {
  'queue.longest_wait': 'kutish >',
  'queue.waiting_without_agents': 'navbatda ≥',
  'calls.abandoned_rate_1h': 'ulush >',
  'trunk.down_seconds': 'davomiyligi >',
  'storage.recordings_used': 'band >',
  'agent.break_seconds': 'davomiyligi >',
};

interface Settings {
  rules: AlertRuleRow[];
  notify: AlertNotify;
}

const minutesText = (from: string, to?: string | null) => {
  const minutes = Math.max(0, dayjs(to ?? undefined).diff(dayjs(from), 'minute'));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} soat ${minutes % 60 ? `${minutes % 60} daqiqa` : ''}`.trim() : `${minutes} daqiqa`;
};

/** "m:ss" ko'rinishidagi kutish limiti */
function SecondsInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [text, setText] = useState('');
  useEffect(() => setText(`${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`), [value]);
  const commit = () => {
    const m = /^(\d{1,3}):([0-5]?\d)$/.exec(text.trim()) ?? /^(\d+)$/.exec(text.trim());
    if (!m) return setText(`${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`);
    const seconds = m[2] !== undefined ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]);
    if (seconds > 0) onChange(seconds);
  };
  return <Input className="mono limit-input" aria-label={label} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onPressEnter={commit} />;
}

/** Ogohlantirishlar (F-MON-03; prototip: Ogohlantirishlar artboardi): faol va yopilgan muammolar, limitlar. */
export default function AlertsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [search, setSearch] = useState('');
  const [paging, setPaging] = useState({ page: 1, pageSize: 10 });
  const [busy, setBusy] = useState<number | null>(null);
  const [draft, setDraft] = useState<Settings>();
  const [saving, setSaving] = useState(false);

  const list = useAsync(
    () => api.get<Page<AlertRow>>('/alerts', { params: { tab, search: search || undefined, ...paging } }).then((r) => r.data),
    [tab, search, paging],
  );
  const counts = useAsync(() => api.get<AlertCounts>('/alerts/counts').then((r) => r.data), []);
  const settings = useAsync(() => api.get<Settings>('/alerts/settings').then((r) => r.data), []);

  useEffect(() => setDraft(settings.data), [settings.data]);
  const refresh = () => {
    void list.reload();
    void counts.reload();
  };
  useSocketEvent('alerts.changed', refresh);
  useEffect(() => {
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.reload, counts.reload]);

  const act = async (alert: AlertRow, action: 'acknowledge' | 'resolve') => {
    setBusy(alert.id);
    try {
      await api.post(`/alerts/${alert.id}/${action}`);
      message.success(action === 'resolve' ? 'Ogohlantirish yopildi' : 'Qabul qilindi');
      refresh();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const body = { rules: draft.rules.map(({ id, threshold, isActive }) => ({ id, threshold, isActive })), notify: draft.notify };
      settings.setData((await api.put<Settings>('/alerts/settings', body)).data);
      message.success('Limitlar saqlandi');
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const setRule = (id: number, patch: Partial<AlertRuleRow>) =>
    setDraft((d) => d && { ...d, rules: d.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(settings.data);

  const c = counts.data;
  const stats: { label: string; value: number | undefined; icon: ReactNode; tone: Tone }[] = [
    { label: 'Kritik', value: c?.critical, icon: <WarningOutlined />, tone: 'red' },
    { label: 'Ogohlantirish', value: c?.warning, icon: <ExclamationCircleOutlined />, tone: 'amber' },
    { label: 'Yopilgan', value: c?.resolved, icon: <CheckCircleOutlined />, tone: 'green' },
  ];

  const thresholdInput = (rule: AlertRuleRow) => {
    const label = `${rule.name}: limit`;
    if (rule.metric === 'agent.break_seconds') {
      return (
        <InputNumber
          className="mono limit-input"
          aria-label={label}
          min={1}
          max={600}
          value={Math.round(rule.threshold / 60)}
          suffix="daq"
          onChange={(v) => v && setRule(rule.id, { threshold: v * 60 })}
        />
      );
    }
    if (rule.unit === 'seconds' && rule.metric !== 'trunk.down_seconds') {
      return <SecondsInput label={label} value={rule.threshold} onChange={(threshold) => setRule(rule.id, { threshold })} />;
    }
    return (
      <InputNumber
        className="mono limit-input"
        aria-label={label}
        min={1}
        max={rule.unit === 'percent' ? 100 : 86_400}
        value={rule.threshold}
        suffix={rule.unit === 'percent' ? '%' : rule.unit === 'seconds' ? 's' : undefined}
        onChange={(v) => v && setRule(rule.id, { threshold: v })}
      />
    );
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Ogohlantirishlar</h1>
          <span className="page-sub">UCM6510 holati va belgilangan limitlar bo'yicha aniqlangan faol hamda yopilgan muammolar · har 30 soniyada tekshiriladi</span>
        </div>
      </div>

      <div className="alerts-grid">
        <div className="alerts-main">
          <div className="alert-stats">
            {stats.map((s) => (
              <div key={s.label} className="alert-stat">
                <span className={`alert-stat-icon tone-${s.tone}`}>{s.icon}</span>
                <span className="kpi-text">
                  <span className="kpi-card-label">{s.label}</span>
                  <span className="kpi-card-value mono">{s.value === undefined ? '—' : formatNumber(s.value)}</span>
                </span>
              </div>
            ))}
          </div>

          <Card size="small" styles={{ body: { padding: 0 } }}>
            <div className="alerts-toolbar">
              <Segmented
                value={tab}
                onChange={(v) => {
                  setTab(v as 'active' | 'history');
                  setPaging((p) => ({ ...p, page: 1 }));
                }}
                options={[
                  { value: 'active', label: <span>Faol <span className="chip-count">{c ? formatNumber(c.active) : ''}</span></span> },
                  { value: 'history', label: <span>Tarix <span className="chip-count">{c ? formatNumber(c.resolved) : ''}</span></span> },
                ]}
              />
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Ogohlantirish, navbat yoki manba"
                aria-label="Ogohlantirishlarni qidirish" data-hotkey="search"
                className="alerts-search"
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPaging((p) => ({ ...p, page: 1 }));
                }}
              />
            </div>
            {list.error && <Alert type="error" showIcon message={list.error} style={{ margin: 12 }} />}
            {list.loading && !list.data ? (
              <Skeleton active style={{ padding: 16 }} />
            ) : (list.data?.items.length ?? 0) === 0 ? (
              <Empty
                style={{ padding: 32 }}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={tab === 'active' ? "Faol ogohlantirish yo'q — hammasi me'yorida" : "Tarixda yozuv yo'q"}
              />
            ) : (
              <ul className="alert-list">
                {list.data!.items.map((a) => (
                  <li key={a.id} className={`alert-item${a.status === 'ACKNOWLEDGED' ? ' is-ack' : ''}`}>
                    <ToneTag tone={SEVERITY[a.severity].tone}>
                      <WarningOutlined /> {SEVERITY[a.severity].label}
                    </ToneTag>
                    <div className="alert-body">
                      <span className="alert-message">{a.message}</span>
                      <span className="alert-source mono">{a.source}</span>
                      <span className="alert-time">
                        {a.status === 'RESOLVED'
                          ? `${dayjs(a.startedAt).format('DD.MM HH:mm')} – ${dayjs(a.resolvedAt).format('HH:mm')} · ${minutesText(a.startedAt, a.resolvedAt)} · ${a.resolvedBy ? `yopdi: ${a.resolvedBy.fullName}` : 'avtomatik yopildi'}`
                          : `${dayjs(a.startedAt).format(dayjs(a.startedAt).isSame(dayjs(), 'day') ? 'HH:mm' : 'DD.MM HH:mm')} dan beri · ${minutesText(a.startedAt)} davom etmoqda`}
                        {a.acknowledgedBy && a.status !== 'RESOLVED' && ` · qabul qildi: ${a.acknowledgedBy.fullName}`}
                      </span>
                    </div>
                    {a.status !== 'RESOLVED' && (
                      <div className="alert-actions">
                        <Button onClick={() => navigate('/live')}>Jonli holat</Button>
                        <Button disabled={a.status !== 'ACTIVE'} loading={busy === a.id} onClick={() => void act(a, 'acknowledge')}>
                          {a.status === 'ACTIVE' ? 'Qabul qildim' : 'Qabul qilingan'}
                        </Button>
                        <Button type="primary" loading={busy === a.id} onClick={() => void act(a, 'resolve')}>
                          Yopish
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="alerts-footer">
              <span className="page-sub">
                {list.data && list.data.total > 0
                  ? `${(paging.page - 1) * paging.pageSize + 1}–${Math.min(paging.page * paging.pageSize, list.data.total)} / ${formatNumber(list.data.total)} ta yozuv`
                  : ''}
              </span>
              <Pagination
                size="small"
                current={paging.page}
                pageSize={paging.pageSize}
                total={list.data?.total ?? 0}
                hideOnSinglePage
                showSizeChanger={false}
                onChange={(page) => setPaging((p) => ({ ...p, page }))}
              />
            </div>
          </Card>
        </div>

        <Card
          size="small"
          className="limits-card"
          title={
            <>
              Limitlar
              <span className="card-sub">Chegaradan oshganda ogohlantirish avtomatik ochiladi</span>
            </>
          }
        >
          {settings.error && <Alert type="error" showIcon message={settings.error} />}
          {!draft ? (
            <Skeleton active />
          ) : (
            <>
              <ul className="limit-list">
                {draft.rules.map((rule) => (
                  <li key={rule.id} className={rule.isActive ? undefined : 'is-off'}>
                    <div className="limit-head">
                      <span className="limit-name">{rule.name}</span>
                      <Checkbox checked={rule.isActive} onChange={(e) => setRule(rule.id, { isActive: e.target.checked })}>
                        Faol
                      </Checkbox>
                    </div>
                    <div className="limit-row">
                      <span className="limit-prefix">{PREFIX[rule.metric] ?? '>'}</span>
                      {thresholdInput(rule)}
                      <span aria-hidden>→</span>
                      <ToneTag tone={SEVERITY[rule.severity].tone}>{SEVERITY[rule.severity].label}</ToneTag>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="limit-notify">
                <span className="limit-name">Kimga xabar beriladi</span>
                <Checkbox checked={draft.notify.bell} onChange={(e) => setDraft({ ...draft, notify: { ...draft.notify, bell: e.target.checked } })}>
                  Supervisorlarga bildirishnoma
                </Checkbox>
                <Checkbox checked={draft.notify.sms} onChange={(e) => setDraft({ ...draft, notify: { ...draft.notify, sms: e.target.checked } })}>
                  Kritik holatda supervisorga SMS
                </Checkbox>
                <Checkbox checked={draft.notify.telegram} onChange={(e) => setDraft({ ...draft, notify: { ...draft.notify, telegram: e.target.checked } })}>
                  Telegram guruhga xabar
                </Checkbox>
                <span className="panel-note">Telegram — ogohlantirishlar guruhiga (TELEGRAM_ALERTS_CHAT_ID), SMS — faqat kritik ogohlantirishlar, telefoni kiritilgan supervisorlarga. Kanallar holati: Tizim → Sozlamalar.</span>
              </div>
              <Button type="primary" block disabled={!dirty} loading={saving} onClick={() => void save()}>
                Limitlarni saqlash
              </Button>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
