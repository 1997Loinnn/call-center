import { Tooltip } from 'antd';
import { formatNumber } from '../../format';
import './charts.css';

/**
 * Viloyatlar bo'yicha murojaatlar xaritasi (F-REP-04): plitkali kartogramma — har bir hudud bir xil kattalikdagi
 * katak, joylashuvi taxminan geografik (g'arbdan sharqqa). Rang — bitta tusning yorug'dan to'qqa ketma-ketligi (miqdor),
 * qiymat har bir katakda yozib qo'yilgan, shuning uchun rang yolg'iz ma'no tashimaydi.
 */

// [ustun, qator] — 7×3 to'r: shimoliy qator, markaziy qator, janubiy qator
const TILES: { name: string; short: string; col: number; row: number }[] = [
  { name: "Qoraqalpog'iston Respublikasi", short: "Qoraqalpog'iston", col: 0, row: 0 },
  { name: 'Navoiy viloyati', short: 'Navoiy', col: 1, row: 0 },
  { name: 'Jizzax viloyati', short: 'Jizzax', col: 2, row: 0 },
  { name: 'Sirdaryo viloyati', short: 'Sirdaryo', col: 3, row: 0 },
  { name: 'Toshkent viloyati', short: 'Toshkent v.', col: 4, row: 0 },
  { name: 'Namangan viloyati', short: 'Namangan', col: 5, row: 0 },
  { name: 'Andijon viloyati', short: 'Andijon', col: 6, row: 0 },
  { name: 'Xorazm viloyati', short: 'Xorazm', col: 0, row: 1 },
  { name: 'Buxoro viloyati', short: 'Buxoro', col: 1, row: 1 },
  { name: 'Samarqand viloyati', short: 'Samarqand', col: 2, row: 1 },
  { name: 'Toshkent shahri', short: 'Toshkent sh.', col: 4, row: 1 },
  { name: "Farg'ona viloyati", short: "Farg'ona", col: 5, row: 1 },
  { name: 'Qashqadaryo viloyati', short: 'Qashqadaryo', col: 2, row: 2 },
  { name: 'Surxondaryo viloyati', short: 'Surxondaryo', col: 3, row: 2 },
];

// Ketma-ket shkala: brend tusi (teal), yorug'dan to'qqa; 0 — neytral kulrang
const STEPS = ['#E3F1F0', '#B9DCDA', '#7FBDB8', '#24807A', '#0B6B6B'];
const ZERO = '#EEF0F3';
/** To'q kataklarda matn oq, yorug'larda — asosiy siyoh (har ikkisida kontrast ≥ 4.5) */
const DARK_FROM = 3;

export default function RegionMap({ data }: { data: { region: string; count: number }[] }) {
  const counts = new Map(data.map((d) => [d.region, d.count]));
  const max = Math.max(1, ...TILES.map((t) => counts.get(t.name) ?? 0));
  const step = (value: number) => (value <= 0 ? -1 : Math.min(STEPS.length - 1, Math.floor((value / max) * STEPS.length - 1e-9)));
  const unknown = data.filter((d) => !TILES.some((t) => t.name === d.region)).reduce((s, d) => s + d.count, 0);

  return (
    <figure className="region-map" aria-label="Viloyatlar bo'yicha murojaatlar xaritasi">
      <div className="region-map-grid">
        {TILES.map((t) => {
          const value = counts.get(t.name) ?? 0;
          const i = step(value);
          return (
            <Tooltip key={t.name} title={`${t.name}: ${formatNumber(value)} ta murojaat`}>
              <div
                className={`region-tile${i >= DARK_FROM ? ' is-dark' : ''}`}
                style={{ gridColumn: t.col + 1, gridRow: t.row + 1, background: i < 0 ? ZERO : STEPS[i] }}
                tabIndex={0}
                aria-label={`${t.name}: ${value} ta`}
              >
                <span className="region-tile-name">{t.short}</span>
                <span className="region-tile-value mono">{formatNumber(value)}</span>
              </div>
            </Tooltip>
          );
        })}
      </div>
      <figcaption className="region-map-legend">
        <span>0</span>
        <span className="region-map-scale" aria-hidden>
          {STEPS.map((c) => (
            <span key={c} style={{ background: c }} />
          ))}
        </span>
        <span>{formatNumber(max)}</span>
        {unknown > 0 && <span className="region-map-unknown">· hudud ko'rsatilmagan: {formatNumber(unknown)}</span>}
      </figcaption>
    </figure>
  );
}
