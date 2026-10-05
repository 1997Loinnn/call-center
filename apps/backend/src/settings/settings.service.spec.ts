import { mergeSetting, SETTING_DEFAULTS } from './settings.service';

describe('mergeSetting', () => {
  it("oddiy qiymat: to'g'ri turdagisi olinadi, aks holda standart", () => {
    expect(mergeSetting(90, 30)).toBe(30);
    expect(mergeSetting(90, '30')).toBe(90);
    expect(mergeSetting(90, null)).toBe(90);
  });

  it("obyekt: faqat ma'lum maydonlar, ichma-ich va massivlar bilan", () => {
    const merged = mergeSetting(SETTING_DEFAULTS.working_hours, { days: [1, 2, 3], start: '08:30', extra: 'x', lunch: { start: 12 } });
    expect(merged).toEqual({ days: [1, 2, 3], start: '08:30', end: '18:00', lunch: { start: '13:00', end: '14:00' } });
    expect(merged).not.toHaveProperty('extra');
  });

  it("saqlangan qiymat bo'lmasa standart qaytadi", () => {
    expect(mergeSetting(SETTING_DEFAULTS.service_level, undefined)).toEqual(SETTING_DEFAULTS.service_level);
  });

  it("null standartli maydon: son yoki null olinadi, obyekt emas", () => {
    expect(mergeSetting(SETTING_DEFAULTS.ivr, { entryMenuId: 5, holidayPromptId: { x: 1 } })).toEqual({ ...SETTING_DEFAULTS.ivr, entryMenuId: 5 });
    expect(mergeSetting(SETTING_DEFAULTS.ivr, { entryMenuId: null }).entryMenuId).toBeNull();
  });
});
