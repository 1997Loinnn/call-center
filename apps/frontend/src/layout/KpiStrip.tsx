import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, PhoneOutlined, WarningOutlined } from '@ant-design/icons';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { Summary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { P } from '../constants';
import { formatDuration, formatNumber } from '../format';
import { TONE, type Tone } from '../theme';

const REFRESH_MS = 60_000;

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
  const overdue = data?.tickets.overdue ?? 0;
  const items: { label: string; value: string; icon: ReactNode; tone: Tone }[] = [
    { label: "Qo'ng'iroqlar", value: calls ? formatNumber(calls.total) : '—', icon: <PhoneOutlined />, tone: 'teal' },
    { label: 'Javob berildi', value: calls ? formatNumber(calls.answered) : '—', icon: <CheckCircleOutlined />, tone: 'green' },
    { label: 'Kutib uzildi', value: calls ? formatNumber(calls.abandoned) : '—', icon: <CloseCircleOutlined />, tone: 'red' },
    { label: "O'rt. kutish", value: calls ? formatDuration(calls.avgWaitSeconds) : '—', icon: <ClockCircleOutlined />, tone: 'teal' },
    { label: "Muddati o'tgan", value: data ? formatNumber(overdue) : '—', icon: <WarningOutlined />, tone: overdue > 0 ? 'red' : 'grey' },
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
