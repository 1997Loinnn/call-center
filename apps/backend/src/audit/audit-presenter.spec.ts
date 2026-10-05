import { browserOf, categoryOf, categoryWhere, changesOf, summaryOf } from './audit-presenter';

describe('audit presenter', () => {
  it("amallarni toifalarga ajratadi (eksport murojaatlardan ustun)", () => {
    expect(categoryOf('ticket.export')).toBe('export');
    expect(categoryOf('ticket.transition')).toBe('tickets');
    expect(categoryOf('auth.login_failed')).toBe('security');
    expect(categoryOf('recording.play')).toBe('recordings');
    expect(categoryOf('alert_rule.update')).toBe('settings');
    expect(categoryWhere('security')).toEqual({
      OR: [{ action: { startsWith: 'auth.' } }, { action: 'user.unlock' }, { action: 'user.reset_password' }, { action: 'user.reset_2fa' }],
    });
  });

  it("o'zgarishlarni avval → keyin ko'rinishida chiqaradi", () => {
    const details = { number: '1097-2026-000038', changes: { status: { from: "Yo'naltirildi", to: 'Ijroda' }, assignee: { from: null, to: 'Qodirova Zuhra' } } };
    const changes = changesOf('ticket.transition', details);
    expect(changes).toEqual([
      { field: 'holat', from: "Yo'naltirildi", to: 'Ijroda' },
      { field: 'ijrochi', from: null, to: 'Qodirova Zuhra' },
    ]);
    expect(summaryOf('ticket.transition', details, changes)).toBe("holat: Yo'naltirildi → Ijroda; ijrochi: — → Qodirova Zuhra");
  });

  it("rol o'zgarishi: qo'shilgan va olingan huquqlar", () => {
    const changes = changesOf('role.update', { code: 'OPERATOR', scope: { from: 'OWN', to: 'UNIT' }, added: ['calls.read'], removed: [] });
    expect(changes).toEqual([
      { field: "ko'rish doirasi", from: 'OWN', to: 'UNIT' },
      { field: "qo'shilgan huquqlar", from: null, to: 'calls.read' },
    ]);
  });

  it('kirish xatosi va brauzer', () => {
    expect(summaryOf('auth.login_failed', { username: 'rahbariyat' }, [])).toBe("Noto'g'ri parol · login «rahbariyat»");
    expect(browserOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36')).toBe('Chrome 129 · Windows 10');
    expect(browserOf('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0')).toBe('Edge 127 · Windows 10');
  });
});
