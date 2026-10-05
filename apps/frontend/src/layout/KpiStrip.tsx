import { CheckCircleOutlined, ClockCircleOutlined, HourglassOutlined, PhoneOutlined, StopOutlined } from '@ant-design/icons';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { Summary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { P } from '../constants';
import { formatDuration, formatNumber } from '../format';
import { TONE, type Tone } from '../theme';

// Navbatdagi qo'ng'iroqlar soni tez o'zgaradi: 15 soniyada bir yangilanadi
const REFRESH_MS = 15_000;

/** Yuqori paneldagi bugungi ko'rsatkichlar. Hisobotlarga ruxsati borlarga ko'rinadi. */
export default function KpiStrip() {
  const { can } = useAuth();
  const allowed = can(P.ReportsView);
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    const load = () =>
      api
        .get<Summary>('/reports/summary')
        .then((r) => alive && setData(r.data))
        .catch(() => undefined);
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [allowed]);

  if (!allowed) return <div className="kpi-strip" />;

  const calls = data?.callsToday;
  const waiting = calls?.waiting ?? null;
  const items: { label: string; value: string; icon: ReactNode; tone: Tone }[] = [
    { label: "Qo'ng'iroqlar", value: calls ? formatNumber(calls.total) : '—', icon: <PhoneOutlined />, tone: 'teal' },
    { label: "O'rt. suhbat", value: calls ? formatDuration(calls.avgTalkSeconds) : '—', icon: <ClockCircleOutlined />, tone: 'teal' },
    { label: 'Javob berildi', value: calls ? formatNumber(calls.answered) : '—', icon: <CheckCircleOutlined />, tone: 'green' },
    { label: 'Navbatda', value: waiting === null ? '—' : formatNumber(waiting), icon: <HourglassOutlined />, tone: waiting ? 'amber' : 'grey' },
    { label: 'Javobsiz', value: calls ? formatNumber(calls.abandoned) : '—', icon: <StopOutlined />, tone: calls?.abandoned ? 'red' : 'grey' },
  ];

  return (
    <ul className="kpi-strip" aria-label="Bugungi ko'rsatkichlar">
      {items.map((item) => (
        <li key={item.label} className="kpi-item">
          <span className="kpi-icon" style={{ background: TONE[item.tone].bg, color: TONE[item.tone].dot }}>
            {item.icon}
          </span>
          <span className="kpi-text">
            <span className="kpi-value">{item.value}</span>
            <span className="kpi-label">{item.label}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
