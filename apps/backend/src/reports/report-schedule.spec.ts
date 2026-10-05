import { describeSchedule, parseSchedule, scheduledPeriod, scheduleKind, scheduleMatches } from './report-schedule';

const at = (s: string) => new Date(s);

describe('report-schedule', () => {
  it('jadvalni o\'qiydi va noto\'g\'risini rad etadi', () => {
    expect(parseSchedule('0 18 * * *')).toEqual({ minute: 0, hour: 18, dayOfMonth: null, dayOfWeek: null });
    expect(parseSchedule('30 8 * * 7')).toEqual({ minute: 30, hour: 8, dayOfMonth: null, dayOfWeek: 0 });
    expect(parseSchedule('0 8 1 * *')?.dayOfMonth).toBe(1);
    expect(parseSchedule('61 8 * * *')).toBeNull();
    expect(parseSchedule('0 24 * * *')).toBeNull();
    expect(parseSchedule('0 8 32 * *')).toBeNull();
    expect(parseSchedule('*/5 * * * *')).toBeNull();
    expect(parseSchedule(null)).toBeNull();
  });

  it('daqiqa, hafta kuni va oy kuniga mos keladi', () => {
    const daily = parseSchedule('0 18 * * *')!;
    expect(scheduleMatches(daily, at('2026-10-05T18:00:30'))).toBe(true);
    expect(scheduleMatches(daily, at('2026-10-05T18:01:00'))).toBe(false);
    const monday = parseSchedule('0 8 * * 1')!;
    expect(scheduleMatches(monday, at('2026-10-05T08:00:00'))).toBe(true); // dushanba
    expect(scheduleMatches(monday, at('2026-10-06T08:00:00'))).toBe(false);
    const sunday = parseSchedule('0 8 * * 7')!;
    expect(scheduleMatches(sunday, at('2026-10-04T08:00:00'))).toBe(true);
  });

  it('oyning 31-kuni qisqa oyda oxirgi kunga suriladi', () => {
    const s = parseSchedule('0 9 31 * *')!;
    expect(scheduleMatches(s, at('2027-02-28T09:00:00'))).toBe(true);
    expect(scheduleMatches(s, at('2026-10-31T09:00:00'))).toBe(true);
    expect(scheduleMatches(s, at('2026-10-30T09:00:00'))).toBe(false);
  });

  it('jadval turiga qarab davr', () => {
    const evening = scheduledPeriod(parseSchedule('0 18 * * *'), at('2026-10-05T18:00:00'));
    expect(evening).toEqual({ from: at('2026-10-05T00:00:00'), to: at('2026-10-05T18:00:00') });
    const morning = scheduledPeriod(parseSchedule('0 8 * * *'), at('2026-10-05T08:00:00'));
    expect(morning).toEqual({ from: at('2026-10-04T00:00:00'), to: at('2026-10-04T23:59:59.999') });
    const weekly = scheduledPeriod(parseSchedule('0 8 * * 1'), at('2026-10-05T08:00:00'));
    expect(weekly).toEqual({ from: at('2026-09-28T00:00:00'), to: at('2026-10-04T23:59:59.999') });
    const monthly = scheduledPeriod(parseSchedule('0 8 1 * *'), at('2026-01-01T08:00:00'));
    expect(monthly).toEqual({ from: at('2025-12-01T00:00:00'), to: at('2025-12-31T23:59:59.999') });
  });

  it('tavsif', () => {
    expect(describeSchedule(parseSchedule('0 18 * * *')!)).toBe('Har kuni 18:00');
    expect(describeSchedule(parseSchedule('5 8 * * 1')!)).toBe('Har dushanba 08:05');
    expect(describeSchedule(parseSchedule('0 8 1 * *')!)).toBe('Har oyning 1-kuni 08:00');
    expect(scheduleKind(parseSchedule('0 8 1 * 1')!)).toBe('monthly');
  });
});
