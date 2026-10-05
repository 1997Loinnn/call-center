import { alertKey, alertMessage, breaches, formatThreshold, Observation, planAlerts, RuleLike } from './alert-rules';

const warn: RuleLike = { id: 1, metric: 'queue.longest_wait', threshold: 20, unit: 'seconds', severity: 'WARNING', isActive: true };
const crit: RuleLike = { id: 2, metric: 'queue.longest_wait', threshold: 60, unit: 'seconds', severity: 'CRITICAL', isActive: true };
const noAgents: RuleLike = { id: 3, metric: 'queue.waiting_without_agents', threshold: 3, unit: 'count', severity: 'CRITICAL', isActive: true };
const wait = (value: number, source = 'q6500'): Observation => ({ metric: 'queue.longest_wait', source, value, label: 'Umumiy navbat (6500)' });
const measured = new Set(['queue.longest_wait', 'queue.waiting_without_agents']);

describe('alert rules', () => {
  it("sanoq limiti ≥, qolganlari > bilan solishtiriladi", () => {
    expect(breaches(noAgents, 3)).toBe(true);
    expect(breaches(warn, 20)).toBe(false);
    expect(breaches(warn, 21)).toBe(true);
  });

  it('limit va xabar matni', () => {
    expect(formatThreshold('queue.longest_wait', 'seconds', 20)).toBe('00:20');
    expect(formatThreshold('agent.break_seconds', 'seconds', 1200)).toBe('20 daq');
    expect(alertMessage(warn, wait(232))).toBe("«Umumiy navbat (6500)» navbatida kutish 03:52 bo'ldi — 00:20 limitidan oshdi.");
  });

  it("faqat eng og'ir buzilgan limit ochiladi", () => {
    const plan = planAlerts([warn, crit], [wait(75)], measured, [], new Set());
    expect(plan.create.map((c) => c.rule.id)).toEqual([2]);
  });

  it("og'irroq limit buzilsa, ogohlantirish darajasidagisi yopiladi; qiymat o'zgarsa yangilanadi", () => {
    const open = [{ id: 10, ruleId: 1, source: 'q6500', value: 30 }];
    const plan = planAlerts([warn, crit], [wait(75)], measured, open, new Set());
    expect(plan.resolve).toEqual([{ alertId: 10, reason: 'superseded' }]);
    expect(plan.create.map((c) => c.rule.id)).toEqual([2]);
    const same = planAlerts([warn, crit], [wait(35)], measured, open, new Set());
    expect(same.update).toHaveLength(1);
    expect(same.create).toHaveLength(0);
  });

  it("holat tiklansa avtomatik yopiladi, o'lchanmagan ko'rsatkichga tegilmaydi", () => {
    const open = [
      { id: 10, ruleId: 1, source: 'q6500', value: 30 },
      { id: 11, ruleId: 3, source: 'q6501', value: 4 },
    ];
    const plan = planAlerts([warn, crit, noAgents], [], new Set(['queue.longest_wait']), open, new Set());
    expect(plan.resolve).toEqual([{ alertId: 10, reason: 'recovered' }]);
  });

  it("qo'lda yopilgan holat tiklanmaguncha qayta ochilmaydi", () => {
    const key = alertKey(1, 'q6500');
    const still = planAlerts([warn, crit], [wait(30)], measured, [], new Set([key]));
    expect(still.create).toHaveLength(0);
    expect(still.release).toEqual([]);
    const recovered = planAlerts([warn, crit], [wait(5)], measured, [], new Set([key]));
    expect(recovered.release).toEqual([key]);
  });

  it("o'chirilgan limitning ochiq ogohlantirishi yopiladi", () => {
    const plan = planAlerts([{ ...warn, isActive: false }, crit], [wait(30)], measured, [{ id: 10, ruleId: 1, source: 'q6500', value: 30 }], new Set());
    expect(plan.resolve).toEqual([{ alertId: 10, reason: 'rule_disabled' }]);
    expect(plan.create).toHaveLength(0);
  });
});
