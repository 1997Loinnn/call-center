import { pickBestRule, RoutingRuleLike } from './routing';

const CORRUPTION = 9;
const CADASTRE_PASSPORT = 3;
const TASHKENT_CITY = 11;
const CHILONZOR = 101;

const rule = (id: number, target: number, over: Partial<RoutingRuleLike>): RoutingRuleLike => ({
  id,
  targetOrgUnitId: target,
  categoryId: null,
  regionId: null,
  districtId: null,
  priority: 100,
  ...over,
});

const rules: RoutingRuleLike[] = [
  rule(1, 500, { priority: 1000 }), // zaxira: call-markaz
  rule(2, 600, { categoryId: CORRUPTION, priority: 10 }), // korrupsiyaga qarshi kurash bo'limi
  rule(3, 700, { regionId: TASHKENT_CITY }), // DKP Toshkent shahar boshqarmasi
  rule(4, 710, { regionId: TASHKENT_CITY, districtId: CHILONZOR }), // Chilonzor filiali
];

describe('pickBestRule', () => {
  it("korrupsiya xabari hududdan qat'i nazar maxsus bo'limga ketadi", () => {
    expect(pickBestRule(rules, { categoryId: CORRUPTION, regionId: TASHKENT_CITY })?.targetOrgUnitId).toBe(600);
  });

  it('tuman qoidasi viloyat qoidasidan ustun', () => {
    const ctx = { categoryId: CADASTRE_PASSPORT, regionId: TASHKENT_CITY, districtId: CHILONZOR };
    expect(pickBestRule(rules, ctx)?.targetOrgUnitId).toBe(710);
  });

  it('viloyat qoidasi ishlaydi', () => {
    expect(pickBestRule(rules, { categoryId: CADASTRE_PASSPORT, regionId: TASHKENT_CITY })?.targetOrgUnitId).toBe(700);
  });

  it("hudud ko'rsatilmasa zaxira qoida tanlanadi", () => {
    expect(pickBestRule(rules, { categoryId: CADASTRE_PASSPORT })?.targetOrgUnitId).toBe(500);
  });

  it("mos qoida bo'lmasa undefined", () => {
    expect(pickBestRule([rules[2]], { regionId: 1 })).toBeUndefined();
  });
});
