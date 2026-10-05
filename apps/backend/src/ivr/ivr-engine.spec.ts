import { IvrAction } from '@prisma/client';
import { IvrFlow, NO_INPUT, scheduleState, simulate, validateFlow } from './ivr-engine';

// Dushanba, 2026-10-05 10:00 (mahalliy vaqt)
const OPEN = new Date(2026, 9, 5, 10, 0);

function flow(): IvrFlow {
  return {
    entryMenuId: 1,
    schedule: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', holidays: ['2026-10-07'] },
    afterHours: { promptId: 9, voicemail: true },
    holidayPromptId: null,
    prompts: [
      { id: 1, name: 'Til', text: "O'zbek tili uchun 1, rus tili uchun 2", hasAudio: true },
      { id: 2, name: 'Asosiy', text: 'Asosiy menyu', hasAudio: false },
      { id: 9, name: 'Tungi', text: 'Ish vaqtidan tashqari', hasAudio: true },
    ],
    queues: [
      { id: 10, number: '6500', name: 'Umumiy', isActive: true, members: 2, maxWaitSeconds: 120, callbackEnabled: true, announcePosition: true },
      { id: 11, number: '6501', name: "Ro'yxatga olish", isActive: true, members: 0, maxWaitSeconds: 90, callbackEnabled: false, announcePosition: false },
    ],
    menus: [
      {
        id: 1,
        code: 'lang',
        name: 'Til tanlash',
        promptId: 1,
        timeoutSeconds: 5,
        maxRetries: 2,
        fallbackQueueId: 10,
        options: [{ digit: '1', label: "O'zbek", action: IvrAction.SUBMENU, targetMenuId: 2, queueId: null, promptId: null }],
      },
      {
        id: 2,
        code: 'main.uz',
        name: 'Asosiy menyu',
        promptId: 2,
        timeoutSeconds: 5,
        maxRetries: 3,
        fallbackQueueId: null,
        options: [
          { digit: '1', label: 'Holat', action: IvrAction.TICKET_STATUS, targetMenuId: null, queueId: null, promptId: null },
          { digit: '2', label: "Ro'yxatga olish", action: IvrAction.QUEUE, queueId: 11, targetMenuId: null, promptId: null },
          { digit: '0', label: 'Operator', action: IvrAction.QUEUE, queueId: 10, targetMenuId: null, promptId: null },
          { digit: '*', label: 'Takrorlash', action: IvrAction.REPEAT, queueId: null, targetMenuId: null, promptId: null },
        ],
      },
    ],
  };
}

describe('scheduleState', () => {
  const s = flow().schedule;
  it('ish vaqti, tushdan keyin, dam olish va bayram kunlari', () => {
    expect(scheduleState(s, OPEN)).toBe('open');
    expect(scheduleState(s, new Date(2026, 9, 5, 18, 0))).toBe('after_hours');
    expect(scheduleState(s, new Date(2026, 9, 4, 11, 0))).toBe('after_hours'); // yakshanba
    expect(scheduleState(s, new Date(2026, 9, 7, 11, 0))).toBe('holiday');
  });
});

describe('simulate', () => {
  it('tilni tanlab navbatga ulanadi', () => {
    const result = simulate(flow(), ['1', '0'], OPEN);
    expect(result.state).toEqual(expect.objectContaining({ type: 'end', outcome: 'queue', queueId: 10 }));
    expect(result.steps.filter((s) => s.kind === 'say').map((s) => s.text)).toEqual(["O'zbek tili uchun 1, rus tili uchun 2", 'Asosiy menyu']);
  });

  it('tugma kutilayotgan menyuni qaytaradi', () => {
    expect(simulate(flow(), ['1'], OPEN).state).toEqual({ type: 'awaiting', menuId: 2 });
  });

  it("javobsizlik: urinishlar tugasa zaxira navbatga o'tadi", () => {
    const result = simulate(flow(), [NO_INPUT, NO_INPUT], OPEN);
    expect(result.state).toEqual(expect.objectContaining({ type: 'end', outcome: 'queue', queueId: 10 }));
  });

  it("noto'g'ri tugma: zaxira navbat bo'lmasa uziladi", () => {
    const result = simulate(flow(), ['1', '7', '8', '9'], OPEN);
    expect(result.state).toEqual(expect.objectContaining({ type: 'end', outcome: 'hangup' }));
  });

  it("operatorsiz navbat va audiosiz xabar haqida ogohlantiradi", () => {
    const result = simulate(flow(), ['1', '2'], OPEN);
    const warnings = result.steps.filter((s) => s.kind === 'warning').map((s) => s.text);
    expect(warnings.some((w) => w.includes('operator biriktirilmagan'))).toBe(true);
    expect(warnings.some((w) => w.includes('audiosi yuklanmagan'))).toBe(true);
  });

  it('ish vaqtidan tashqari avtojavob va ovozli xabar', () => {
    const result = simulate(flow(), ['1'], new Date(2026, 9, 5, 20, 0));
    expect(result.schedule).toBe('after_hours');
    expect(result.state).toEqual(expect.objectContaining({ type: 'end', outcome: 'voicemail' }));
    expect(result.steps[0].text).toBe('Ish vaqtidan tashqari');
  });
});

describe('validateFlow', () => {
  it("to'g'ri oqimda xato yo'q, faqat ogohlantirishlar", () => {
    const issues = validateFlow(flow());
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(issues.some((i) => i.message.includes('6501'))).toBe(true);
  });

  it("navbatsiz tugma, yo'q menyu va yetib bo'lmaydigan menyuni topadi", () => {
    const f = flow();
    f.menus[1].options.push({ digit: '5', label: 'Bo\'sh', action: IvrAction.QUEUE, queueId: null, targetMenuId: null, promptId: null });
    f.menus[0].options.push({ digit: '2', label: 'Rus', action: IvrAction.SUBMENU, targetMenuId: 99, queueId: null, promptId: null });
    f.menus.push({ id: 3, code: 'orphan', name: 'Yetim', promptId: 1, timeoutSeconds: 5, maxRetries: 3, fallbackQueueId: null, options: [] });
    const messages = validateFlow(f).map((i) => `${i.level}: ${i.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^error: Asosiy menyu: «5».*navbat tanlanmagan/),
        expect.stringMatching(/^error: Til tanlash: «2».*menyu tanlanmagan/),
        expect.stringMatching(/^error: Yetim: tugmalar yo'q/),
        expect.stringMatching(/^warning: Yetim: boshlang'ich menyudan/),
      ]),
    );
  });

  it("boshlang'ich menyusiz oqim — xato", () => {
    expect(validateFlow({ ...flow(), entryMenuId: null }).some((i) => i.level === 'error')).toBe(true);
  });
});
