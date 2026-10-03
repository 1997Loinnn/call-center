import type { ReactNode } from 'react';
import { TONE, type Tone } from '../theme';

/** Holat belgisi: rangli fon + nuqta + yozuv (rang hech qachon yolg'iz ma'no bermaydi). */
export default function ToneTag({ tone, children }: { tone: Tone; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <span className="tone-tag" style={{ background: t.bg, color: t.fg }}>
      <span className="tone-dot" style={{ background: t.dot }} />
      {children}
    </span>
  );
}
