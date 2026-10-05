import { CheckOutlined, WarningOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

export type KpiStatus = 'good' | 'warn' | 'bad';

/**
 * Ko'rsatkich kartasi (prototip: KPI kartasi · SLA): nomi, katta qiymat (Plex Mono) va izoh.
 * Holat izohi doim ikonka + matn bilan chiqadi — rang yolg'iz ma'no bermaydi.
 */
export default function KpiCard({ label, value, sub, status }: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  status?: KpiStatus;
}) {
  return (
    <div className="kpi-card">
      <span className="kpi-card-label">{label}</span>
      <span className="kpi-card-value mono">{value}</span>
      {sub && (
        <span className={`kpi-card-sub${status ? ` is-${status}` : ''}`}>
          {status === 'good' && <CheckOutlined aria-hidden />}
          {(status === 'warn' || status === 'bad') && <WarningOutlined aria-hidden />}
          {sub}
        </span>
      )}
    </div>
  );
}
