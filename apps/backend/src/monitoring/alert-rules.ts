import { AlertSeverity } from '@prisma/client';

/** Ko'rsatkichning bir manbadagi joriy qiymati (masalan, 6500-navbatda eng uzoq kutish). */
export interface Observation {
  metric: string;
  source: string;
  value: number;
  /** Xabardagi nom: navbat, operator yoki trunk */
  label: string;
  details?: Record<string, string | number | null>;
}

export interface RuleLike {
  id: number;
  metric: string;
  threshold: number;
  unit: string;
  severity: AlertSeverity;
  isActive: boolean;
}

export interface OpenAlertLike {
  id: number;
  ruleId: number | null;
  source: string;
  value: number | null;
}

export interface AlertPlan {
  create: { rule: RuleLike; observation: Observation }[];
  update: { alertId: number; rule: RuleLike; observation: Observation }[];
  resolve: { alertId: number; reason: 'recovered' | 'superseded' | 'rule_disabled' }[];
  /** Qo'lda yopilgan, endi esa holati tiklangan (qayta ochilishi mumkin bo'lgan) kalitlar */
  release: string[];
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { CRITICAL: 3, WARNING: 2, INFO: 1 };

export const alertKey = (ruleId: number, source: string) => `${ruleId}|${source}`;

/** Sanoq limiti "≥" (navbatda ≥ 3 ta), qolganlari "chegaradan oshsa" (>). */
export function breaches(rule: RuleLike, value: number): boolean {
  return rule.metric === 'queue.waiting_without_agents' ? value >= rule.threshold : value > rule.threshold;
}

const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Limit qiymati foydalanuvchiga ko'rinadigan shaklda: 00:20, 85%, 3, 20 daq. */
export function formatThreshold(metric: string, unit: string, value: number): string {
  if (metric === 'agent.break_seconds') return `${Math.round(value / 60)} daq`;
  if (unit === 'seconds') return metric === 'trunk.down_seconds' ? `${value} s` : mmss(value);
  if (unit === 'percent') return `${value}%`;
  return String(value);
}

export function alertMessage(rule: RuleLike, o: Observation): string {
  const limit = formatThreshold(rule.metric, rule.unit, rule.threshold);
  switch (rule.metric) {
    case 'queue.longest_wait':
      return `«${o.label}» navbatida kutish ${mmss(o.value)} bo'ldi — ${limit} limitidan oshdi.`;
    case 'queue.waiting_without_agents':
      return `«${o.label}» navbatida ${o.value} ta qo'ng'iroq kutmoqda, bo'sh operator yo'q.`;
    case 'calls.abandoned_rate_1h':
      return `Oxirgi 1 soatda javobsiz qo'ng'iroqlar ${o.value}% bo'ldi — ${limit} limitidan oshdi.`;
    case 'trunk.down_seconds':
      return `SIP trunk «${o.label}» ${o.value} soniyadan beri ulanmagan.`;
    case 'storage.recordings_used':
      return `Yozuvlar arxivi diski ${o.value}% to'ldi (limit ${limit}, yozuvlar 3 oy saqlanadi).`;
    case 'agent.break_seconds':
      return `${o.label} ${Math.round(o.value / 60)} daqiqadan beri tanaffusda (limit ${limit}).`;
    default:
      return `${o.label}: ${o.value} — ${limit} limitidan oshdi.`;
  }
}

/**
 * Ogohlantirishlarni kuzatuvlar bilan solishtiradi (F-MON-03):
 * - bir ko'rsatkich va manba uchun faqat eng og'ir buzilgan limit ochiq turadi;
 * - holat tiklansa yoki og'irroq limit buzilsa, ochiq ogohlantirish avtomatik yopiladi;
 * - qo'lda yopilgan (suppressed) holat tiklanmaguncha qayta ochilmaydi;
 * - faqat shu safar o'lchangan ko'rsatkichlar bo'yicha qaror qilinadi (PBX javob bermasa, navbat ogohlantirishlari tegilmaydi).
 */
export function planAlerts(
  rules: RuleLike[],
  observations: Observation[],
  measured: Set<string>,
  open: OpenAlertLike[],
  suppressed: Set<string>,
): AlertPlan {
  const plan: AlertPlan = { create: [], update: [], resolve: [], release: [] };
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const wanted = new Map<string, { rule: RuleLike; observation: Observation }>();

  for (const o of observations) {
    if (!measured.has(o.metric)) continue;
    const winner = rules
      .filter((r) => r.isActive && r.metric === o.metric && breaches(r, o.value))
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.threshold - a.threshold)[0];
    if (winner) wanted.set(alertKey(winner.id, o.source), { rule: winner, observation: o });
  }

  const openKeys = new Set<string>();
  for (const alert of open) {
    if (alert.ruleId === null) continue; // qo'lda yoki tashqi manbadan ochilgan — faqat qo'lda yopiladi
    const rule = ruleById.get(alert.ruleId);
    const key = alertKey(alert.ruleId, alert.source);
    if (!rule) continue;
    if (!rule.isActive) {
      plan.resolve.push({ alertId: alert.id, reason: 'rule_disabled' });
      continue;
    }
    if (!measured.has(rule.metric)) continue;
    const target = wanted.get(key);
    if (target) {
      openKeys.add(key);
      if (alert.value !== target.observation.value) plan.update.push({ alertId: alert.id, ...target });
    } else {
      const superseded = [...wanted.values()].some((w) => w.rule.metric === rule.metric && w.observation.source === alert.source);
      plan.resolve.push({ alertId: alert.id, reason: superseded ? 'superseded' : 'recovered' });
    }
  }

  for (const [key, target] of wanted) {
    if (!openKeys.has(key) && !suppressed.has(key)) plan.create.push(target);
  }
  plan.release = [...suppressed].filter((key) => {
    const ruleId = Number(key.split('|')[0]);
    const rule = ruleById.get(ruleId);
    return !wanted.has(key) && (!rule || measured.has(rule.metric) || !rule.isActive);
  });
  return plan;
}
