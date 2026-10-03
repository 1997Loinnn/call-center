export interface RoutingRuleLike {
  id: number;
  categoryId: number | null;
  regionId: number | null;
  districtId: number | null;
  priority: number;
  targetOrgUnitId: number;
}

export interface RoutingContext {
  categoryId?: number | null;
  regionId?: number | null;
  districtId?: number | null;
}

/** Qoidadagi null maydon "istalgan qiymat" degani. */
export function ruleMatches(rule: RoutingRuleLike, ctx: RoutingContext): boolean {
  return (
    (rule.categoryId === null || rule.categoryId === ctx.categoryId) &&
    (rule.regionId === null || rule.regionId === ctx.regionId) &&
    (rule.districtId === null || rule.districtId === ctx.districtId)
  );
}

/** Qanchalik aniq qoida: tuman > viloyat > toifa. */
export function specificity(rule: RoutingRuleLike): number {
  return (rule.districtId !== null ? 4 : 0) + (rule.regionId !== null ? 2 : 0) + (rule.categoryId !== null ? 1 : 0);
}

/**
 * Yo'naltirish jadvalidan eng mos qoidani tanlaydi (TZ 5-bo'lim, F-CRM-03):
 * avval priority (kichigi ustun), teng bo'lsa aniqrog'i.
 */
export function pickBestRule<T extends RoutingRuleLike>(rules: T[], ctx: RoutingContext): T | undefined {
  return rules
    .filter((rule) => ruleMatches(rule, ctx))
    .sort((a, b) => a.priority - b.priority || specificity(b) - specificity(a))[0];
}
