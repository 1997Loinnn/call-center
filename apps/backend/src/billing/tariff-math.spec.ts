import { chargeFor, dialedDigits, isExternalNumber, limitLevel, matchTariff, monthKey, monthRange, TariffLike } from './tariff-math';

const t = (id: number, prefix: string, price: number, from = '2026-01-01', to: string | null = null, step = 60): TariffLike => ({
  id,
  prefix,
  pricePerMinute: price,
  billingStepSec: step,
  validFrom: new Date(`${from}T00:00:00`),
  validTo: to ? new Date(`${to}T00:00:00`) : null,
});

describe('tariff-math', () => {
  const tariffs = [t(1, '998', 75), t(2, '99890', 130), t(3, '99871', 40), t(4, '7', 2600)];
  const at = new Date('2026-06-15T10:00:00');

  it('raqamni xalqaro raqamlar ko\'rinishiga keltiradi', () => {
    expect(dialedDigits('+998 (90) 123-45-67')).toBe('998901234567');
    expect(dialedDigits('901234567')).toBe('998901234567');
    expect(dialedDigits('0074951234567')).toBe('74951234567');
    expect(dialedDigits('8107 495 123 45 67')).toBe('74951234567');
  });

  it('ichki va qisqa raqamlar tashqi hisoblanmaydi', () => {
    expect(isExternalNumber('1005')).toBe(false);
    expect(isExternalNumber('1097')).toBe(false);
    expect(isExternalNumber('+998901234567')).toBe(true);
  });

  it('eng uzun prefiks tanlanadi', () => {
    expect(matchTariff(tariffs, '+998901234567', at)?.id).toBe(2);
    expect(matchTariff(tariffs, '+998712345678', at)?.id).toBe(3);
    expect(matchTariff(tariffs, '+998612345678', at)?.id).toBe(1);
    expect(matchTariff(tariffs, '+74951234567', at)?.id).toBe(4);
    expect(matchTariff(tariffs, '+441234567890', at)).toBeNull();
  });

  it('amal qilish muddatini hisobga oladi va yangi narxni afzal ko\'radi', () => {
    const list = [t(1, '99890', 130, '2026-01-01', '2026-07-01'), t(2, '99890', 150, '2026-07-01')];
    expect(matchTariff(list, '998901234567', new Date('2026-06-30T23:59:00'))?.id).toBe(1);
    expect(matchTariff(list, '998901234567', new Date('2026-07-01T00:00:00'))?.id).toBe(2);
    expect(matchTariff([t(5, '998', 75, '2027-01-01')], '998901234567', at)).toBeNull();
    // Muddat chegarasi qo'yilmagan ikki tarif: keyinroq kuchga kirgani
    const overlap = [t(1, '99890', 130, '2026-01-01'), t(2, '99890', 150, '2026-05-01')];
    expect(matchTariff(overlap, '998901234567', at)?.id).toBe(2);
  });

  it('tariflash qadamiga yuqoriga yaxlitlaydi', () => {
    expect(chargeFor(t(2, '99890', 130), 61)).toEqual({ tariffId: 2, billableSec: 120, amount: 260 });
    expect(chargeFor(t(2, '99890', 130), 60)).toEqual({ tariffId: 2, billableSec: 60, amount: 130 });
    expect(chargeFor(t(2, '99890', 130), 0)).toEqual({ tariffId: 2, billableSec: 0, amount: 0 });
    // Soniyali tariflash: 61 s × 130/60
    expect(chargeFor(t(2, '99890', 130, '2026-01-01', null, 1), 61).amount).toBe(132.17);
    // 30 soniyalik qadam
    expect(chargeFor(t(2, '99890', 100, '2026-01-01', null, 30), 31)).toEqual({ tariffId: 2, billableSec: 60, amount: 100 });
  });

  it('oy chegaralari', () => {
    const { from, to } = monthRange('2026-12');
    expect(from).toEqual(new Date(2026, 11, 1));
    expect(to).toEqual(new Date(2027, 0, 1));
    expect(monthKey(new Date(2026, 1, 28))).toBe('2026-02');
    expect(() => monthRange('2026-1')).toThrow();
  });

  it('limit darajasi', () => {
    expect(limitLevel(0, 1000, 80)).toBe(0);
    expect(limitLevel(799, 1000, 80)).toBe(0);
    expect(limitLevel(800, 1000, 80)).toBe(1);
    expect(limitLevel(1000, 1000, 80)).toBe(2);
    expect(limitLevel(0, 0, 80)).toBe(0);
    expect(limitLevel(1, 0, 80)).toBe(2);
  });
});
