import { useEffect, useRef, useState } from 'react';
import { formatNumber } from '../../format';
import './charts.css';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Tooltipdagi qo'shimcha qator, masalan "javob berildi 335 · uzildi 19" */
  hint?: string;
  /** Tugallanmagan davr (joriy soat yoki kun) och rangda chiqadi */
  partial?: boolean;
}

const PAD = { top: 10, right: 8, bottom: 26, left: 40 };
const MAX_BAR = 24;

/** Y o'qi uchun "toza" yuqori chegara: 1, 2, 2.5, 5 × 10^n */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** Yuqori burchaklari 4 px yumaloq, asosi to'g'ri ustun. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Bitta seriyali ustunli grafik (SVG): toza o'q bo'linmalari, ingichka to'r, har ustunga tooltip.
 * Ekran o'quvchi uchun qisqacha tavsif aria-label'da, to'liq qiymatlar jadval ko'rinishida (chart-table).
 */
export default function BarChart({ data, height = 220, unit = 'ta', ariaLabel }: {
  data: BarDatum[];
  height?: number;
  unit?: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const band = data.length > 0 ? plotW / data.length : plotW;
  const barW = Math.max(3, Math.min(MAX_BAR, band - 6));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  // Ko'p ustunda (30 kun) har bir yorliq sig'maydi: taxminan 44 px ga bittadan
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, plotW / 44)));
  const active = hover !== null ? data[hover] : null;

  return (
    <div className="bar-chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="chart-tick">
              {formatNumber(Math.round(t))}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = PAD.left + band * i + band / 2;
          const h = Math.max(d.value > 0 ? 1 : 0, (d.value / max) * plotH);
          return (
            <g key={d.key}>
              {h > 0 && (
                <path d={barPath(cx - barW / 2, PAD.top + plotH - h, barW, h)} className={`chart-bar${d.partial ? ' is-partial' : ''}${hover === i ? ' is-hover' : ''}`} />
              )}
              {i % labelEvery === 0 && (
                <text x={cx} y={height - 8} textAnchor="middle" className="chart-tick">
                  {d.label}
                </text>
              )}
              {/* Sichqoncha nishoni ustundan kattaroq: butun ustun polosasi */}
              <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {active && hover !== null && (
        <div
          className="chart-tooltip"
          style={{ left: Math.min(width - 150, Math.max(0, PAD.left + band * hover + band / 2 - 70)), top: Math.max(0, y(active.value) - 64) }}
          role="status"
        >
          <span className="chart-tooltip-title">{active.label}{active.partial ? ' (davom etmoqda)' : ''}</span>
          <span className="chart-tooltip-value">
            {formatNumber(active.value)} {unit}
          </span>
          {active.hint && <span className="chart-tooltip-hint">{active.hint}</span>}
        </div>
      )}
    </div>
  );
}

/** Grafikning jadval ko'rinishi (qiymatlarni rangga qaramasdan o'qish uchun). */
export function ChartTable({ data, labelTitle, valueTitle }: { data: BarDatum[]; labelTitle: string; valueTitle: string }) {
  return (
    <div className="chart-table-wrap">
      <table className="chart-table">
        <thead>
          <tr>
            <th scope="col">{labelTitle}</th>
            <th scope="col">{valueTitle}</th>
            <th scope="col">Tafsilot</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <td>{d.label}</td>
              <td className="num">{formatNumber(d.value)}</td>
              <td className="cell-sub">{d.hint ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
