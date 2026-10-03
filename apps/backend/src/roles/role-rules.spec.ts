import { Permission } from '../common/permissions';
import { diffPermissions, losesUserManagement, normalizePermissions, ROLE_CODE_PATTERN, unknownPermissions } from './role-rules';

describe('role-rules', () => {
  it("noma'lum ruxsat kodlarini topadi", () => {
    expect(unknownPermissions([Permission.TicketsRead, 'tickets.delete', 'x'])).toEqual(['tickets.delete', 'x']);
    expect(unknownPermissions([Permission.AuditRead])).toEqual([]);
  });

  it("normalizatsiya noma'lum kodni tashlab yuboradi — shuning uchun tekshiruv undan oldin bo'lishi shart", () => {
    const raw = [Permission.TicketsRead, 'tickets.delete'];
    expect(normalizePermissions(raw)).toEqual([Permission.TicketsRead]);
    expect(unknownPermissions(raw)).toEqual(['tickets.delete']);
  });

  it('takrorlarni olib, katalog tartibida saralaydi', () => {
    expect(normalizePermissions([Permission.AuditRead, Permission.TicketsRead, Permission.TicketsRead])).toEqual([
      Permission.TicketsRead,
      Permission.AuditRead,
    ]);
  });

  it("qo'shilgan va olib tashlangan ruxsatlarni ajratadi", () => {
    expect(diffPermissions([Permission.TicketsRead, Permission.CallsRead], [Permission.TicketsRead, Permission.ReportsView])).toEqual({
      added: [Permission.ReportsView],
      removed: [Permission.CallsRead],
    });
  });

  it('users.manage olib tashlanayotganini aniqlaydi', () => {
    expect(losesUserManagement([Permission.UsersManage], [])).toBe(true);
    expect(losesUserManagement([Permission.UsersManage], [Permission.UsersManage])).toBe(false);
    expect(losesUserManagement([], [Permission.UsersManage])).toBe(false);
  });

  it('rol kodi formati', () => {
    expect(ROLE_CODE_PATTERN.test('SHIFT_LEAD')).toBe(true);
    expect(ROLE_CODE_PATTERN.test('shift')).toBe(false);
    expect(ROLE_CODE_PATTERN.test('A')).toBe(false);
  });
});
