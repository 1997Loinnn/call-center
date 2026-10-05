import { ArrowLeftOutlined, FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { AgentStatus, AlertCounts, LiveData } from '../../api/types';
import { AGENT_STATUS_META } from '../../constants';
import { formatClock } from '../../format';
import { useAsync } from '../../hooks/useAsync';
import { TONE } from '../../theme';
import './wall.css';

const REFRESH_MS = 5_000;
const STATUS_ORDER: AgentStatus[] = ['READY', 'ON_CALL', 'WRAP_UP', 'BREAK', 'OFFLINE'];

/**
 * Katta ekran (videodevor) rejimi (F-MON-04): call-markaz zalidagi televizor uchun — navbat, kutish, xizmat darajasi,
 * operatorlar holati va ogohlantirishlar katta shriftda, har 5 soniyada yangilanadi. Shaxsiy ma'lumot ko'rsatilmaydi.
 */
export default function WallPage() {
  const live = useAsync(() => api.get<LiveData>('/monitoring/live').then((r) => r.data), []);
  const alerts = useAsync(() => api.get<AlertCounts>('/alerts/counts').then((r) => r.data), []);
  const [now, setNow] = useState(Date.now());
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    document.title = '1097 · Katta ekran';
    const refresh = setInterval(() => {
      void live.reload();
      void alerts.reload();
    }, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
      document.removeEventListener('fullscreenchange', onFs);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };

  const d = live.data;
  const k = d?.kpi;
  const sl = d?.serviceLevel;
  const slaOk = k?.slaPercent !== null && k?.slaPercent !== undefined && sl ? k.slaPercent >= sl.targetPercent : null;
  const waitBad = !!k && !!sl && k.longestWaitSeconds > sl.answerWithinSeconds * 3;

  return (
    <div className="wall">
      <header className="wall-head">
        <span className="wall-title">1097 · Kadastr agentligi ishonch telefoni</span>
        <span className="wall-clock mono">{dayjs(now).format('HH:mm:ss')}</span>
        <span className="wall-actions">
          <Link to="/live" className="wall-btn" aria-label="Jonli holatga qaytish">
            <ArrowLeftOutlined />
          </Link>
          <button type="button" className="wall-btn" onClick={toggleFullscreen} aria-label={fullscreen ? "To'liq ekrandan chiqish" : "To'liq ekran"}>
            {fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          </button>
        </span>
      </header>

      {!d || !k ? (
        <div className="wall-loading">{live.error ?? 'Yuklanmoqda…'}</div>
      ) : (
        <>
          <section className="wall-kpis">
            <div className={`wall-kpi${k.waiting > 0 ? ' is-warn' : ''}`}>
              <span className="wall-kpi-value mono">{d.queueSupported ? k.waiting : '—'}</span>
              <span className="wall-kpi-label">Navbatda kutmoqda</span>
            </div>
            <div className={`wall-kpi${waitBad ? ' is-bad' : ''}`}>
              <span className="wall-kpi-value mono">{d.queueSupported ? formatClock(k.longestWaitSeconds) : '—'}</span>
              <span className="wall-kpi-label">Eng uzoq kutish</span>
            </div>
            <div className={`wall-kpi${slaOk === false ? ' is-bad' : slaOk ? ' is-good' : ''}`}>
              <span className="wall-kpi-value mono">{k.slaPercent === null ? '—' : `${k.slaPercent}%`}</span>
              <span className="wall-kpi-label">
                {sl?.answerWithinSeconds} s ichida javob · maqsad {sl?.targetPercent}%
              </span>
            </div>
            <div className="wall-kpi">
              <span className="wall-kpi-value mono">{k.answered}</span>
              <span className="wall-kpi-label">Bugun javob berildi</span>
            </div>
            <div className={`wall-kpi${k.lost > 0 ? ' is-warn' : ''}`}>
              <span className="wall-kpi-value mono">{k.lost}</span>
              <span className="wall-kpi-label">Yo'qotilgan</span>
            </div>
            <div className={`wall-kpi${(alerts.data?.critical ?? 0) > 0 ? ' is-bad' : ''}`}>
              <span className="wall-kpi-value mono">{alerts.data ? alerts.data.active : '—'}</span>
              <span className="wall-kpi-label">Faol ogohlantirish{alerts.data?.critical ? ` · ${alerts.data.critical} kritik` : ''}</span>
            </div>
          </section>

          <section className="wall-body">
            <div className="wall-panel">
              <h2>Operatorlar · {k.agentsOnline} / {k.agentsTotal} tizimda</h2>
              <div className="wall-status-bar">
                {STATUS_ORDER.map((s) => (
                  <span key={s} className="wall-status" style={{ borderColor: TONE[AGENT_STATUS_META[s].tone].dot }}>
                    <span className="mono wall-status-count">{k.byStatus[s] ?? 0}</span>
                    {AGENT_STATUS_META[s].label}
                  </span>
                ))}
              </div>
              <div className="wall-agents">
                {d.agents
                  .filter((a) => a.status !== 'OFFLINE')
                  .map((a) => (
                    <div key={a.id} className="wall-agent" style={{ borderLeftColor: TONE[AGENT_STATUS_META[a.status].tone].dot }}>
                      <span className="wall-agent-name">{a.fullName}</span>
                      <span className="wall-agent-sub">
                        {AGENT_STATUS_META[a.status].label}
                        {a.since ? ` · ${formatClock((now - new Date(a.since).getTime()) / 1000)}` : ''}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
            <div className="wall-panel">
              <h2>Navbatlar</h2>
              {!d.queueSupported ? (
                <p className="wall-muted">Navbat ma'lumoti UCM6510 AMI ulangach ko'rinadi</p>
              ) : (
                <table className="wall-queues">
                  <tbody>
                    {d.queues.map((q) => {
                      const items = d.waiting.filter((w) => w.queue === q.queue);
                      const longest = items.reduce((m, w) => Math.max(m, w.waitSeconds), 0);
                      return (
                        <tr key={q.queue} className={items.length ? 'has-waiting' : undefined}>
                          <td className="mono">{q.queue}</td>
                          <td>{q.name}</td>
                          <td className="mono wall-num">{items.length}</td>
                          <td className="mono wall-num">{items.length ? formatClock(longest) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
          <footer className="wall-foot">Yangilangan: {dayjs(d.updatedAt).format('HH:mm:ss')} · har 5 soniyada</footer>
        </>
      )}
    </div>
  );
}
