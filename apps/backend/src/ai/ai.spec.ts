import { erlangC, serviceLevel, staffing, weightedForecast } from './forecast';
import { DEFAULT_KEYWORD_GROUPS, scanKeywords } from './keywords';
import { findPlace, predict, tokenize, train } from './text-classifier';

describe('text-classifier', () => {
  it('tokenizatsiya: tutuq belgilari, to\'xtash so\'zlari va o\'zak', () => {
    expect(tokenize("Fuqaro arizasi bo‘yicha so'radi, 603061372")).toEqual(['arizas']);
    expect(tokenize('Kadastr pasportini olish')).toEqual(['kadast', 'paspor', 'olish']);
  });

  it('o\'xshash matn uchun to\'g\'ri mavzu', () => {
    const model = train([
      { label: 1, text: 'Ariza holati qaysi bosqichda, javob kelmagan' },
      { label: 1, text: 'Arizamga hali javob yo\'q, holatini bilmoqchi' },
      { label: 1, text: 'Ariza qachon ko\'rib chiqiladi' },
      { label: 2, text: 'Kadastr pasportini qayta olish uchun hujjatlar' },
      { label: 2, text: 'Kadastr pasporti yo\'qolgan, dublikat kerak' },
      { label: 3, text: 'Operatorga rahmat, aniq ma\'lumot berdi' },
    ]);
    expect(predict(model, 'Arizam holati haqida javob kelmayapti')[0].label).toBe(1);
    const p = predict(model, 'kadastr pasporti yo\'qoldi');
    expect(p[0].label).toBe(2);
    expect(p[0].probability).toBeGreaterThan(0.5);
    expect(predict(model, 'xyz qwerty')).toEqual([]);
  });

  it('matndagi joy nomi', () => {
    const places = [
      { id: 1, name: 'Toshkent shahri' },
      { id: 2, name: "Farg'ona viloyati" },
      { id: 3, name: 'Baliqchi tumani' },
    ];
    expect(findPlace('Fuqaro Baliqchi tumani, Turon ko\'chasi', places)?.id).toBe(3);
    expect(findPlace('Farg‘ona shahridagi uy', places)?.id).toBe(2);
    // Viloyat nomi bilan bir xil shahar faqat to'liq nomi bilan ("shahri" qo'shimchalari bilan ham)
    const city = [{ id: 9, name: "Farg'ona shahri", exact: true }];
    expect(findPlace("Farg'ona viloyatidan", city)).toBeNull();
    expect(findPlace("Farg'ona shahri, Mustaqillik ko'chasi", city)?.id).toBe(9);
    expect(findPlace("Farg'ona shahrida", city)?.id).toBe(9);
    expect(findPlace('Hech qanday joy yo\'q', places)).toBeNull();
  });
});

describe('keywords', () => {
  it('qo\'shimchalar bilan topadi, so\'z o\'rtasidan emas', () => {
    const hits = scanKeywords("Xodim poraxo'rlik qildi, ish uchun pul so'radi. Prokuraturaga boraman", DEFAULT_KEYWORD_GROUPS);
    expect(hits.map((h) => h.key)).toEqual(['corruption', 'escalation']);
    expect(hits[0].words).toEqual(['pora', "pul so'ra"]);
    expect(scanKeywords('Diaspora vakili sifatida murojaat', DEFAULT_KEYWORD_GROUPS)).toEqual([]);
    expect(scanKeywords('O‘z joniga qasd qilmoqchi', DEFAULT_KEYWORD_GROUPS)[0].key).toBe('threat');
  });
});

describe('forecast', () => {
  it('yaqin haftalar og\'irroq', () => {
    expect(weightedForecast([10, 10, 10])).toBe(10);
    expect(weightedForecast([20, 10])).toBe(15.6); // (20 + 8) / 1.8
    expect(weightedForecast([null, null])).toBe(0);
    expect(weightedForecast([null, 10])).toBe(10);
  });

  it('Erlang C — ma\'lum qiymatlar', () => {
    // A = 2 erlang, N = 3: C ≈ 0.4444
    expect(erlangC(3, 2)).toBeCloseTo(0.4444, 3);
    expect(erlangC(2, 2)).toBe(1);
    // 100 qo'ng'iroq/soat, AHT 180 s → A = 5; N = 7, T = 20 s: C ≈ 0.324, SL ≈ 0.74
    expect(erlangC(7, 5)).toBeCloseTo(0.3241, 3);
    expect(serviceLevel(7, 5, 180, 20)).toBeCloseTo(0.74, 2);
  });

  it('shtat hisobi', () => {
    const s = staffing({ callsPerHour: 100, ahtSeconds: 180, targetSeconds: 20, targetLevel: 0.8, shrinkage: 0.3 });
    expect(s.traffic).toBe(5);
    expect(s.agents).toBeGreaterThanOrEqual(7);
    expect(s.serviceLevel).toBeGreaterThanOrEqual(80);
    expect(s.scheduled).toBe(Math.ceil(s.agents / 0.7));
    expect(staffing({ callsPerHour: 0, ahtSeconds: 180, targetSeconds: 20, targetLevel: 0.8, shrinkage: 0.3 }).agents).toBe(0);
  });
});
