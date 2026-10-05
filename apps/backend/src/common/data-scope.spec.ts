import { DataScope } from '@prisma/client';
import { AuthUser } from './auth-user';
import { managesOrgUnit, ticketScopeWhere, widestScope } from './data-scope';
import { Permission } from './permissions';

const baseUser: AuthUser = {
  id: 7,
  username: 'operator1',
  fullName: 'Demo Operator',
  orgUnitId: 2,
  orgUnitPath: '/1/2/',
  orgUnitName: 'Call-markaz 1097',
  sipExtension: '1001',
  roles: ['OPERATOR'],
  permissions: [Permission.TicketsRead],
  scope: DataScope.OWN,
  twoFactor: false,
};

describe('widestScope', () => {
  it('eng keng doirani tanlaydi', () => {
    expect(widestScope([DataScope.OWN, DataScope.UNIT_TREE, DataScope.UNIT])).toBe(DataScope.UNIT_TREE);
  });

  it("rol bo'lmasa OWN qaytaradi", () => {
    expect(widestScope([])).toBe(DataScope.OWN);
  });
});

describe('ticketScopeWhere', () => {
  it("operator faqat o'z murojaatlarini va maxfiy bo'lmaganlarini ko'radi", () => {
    expect(ticketScopeWhere(baseUser)).toEqual({
      AND: [{ OR: [{ createdById: 7 }, { assigneeId: 7 }] }, { isConfidential: false }],
    });
  });

  it("direktor (ALL + confidential) hamma narsani ko'radi", () => {
    const director = { ...baseUser, scope: DataScope.ALL, permissions: [Permission.TicketsConfidential] };
    expect(ticketScopeWhere(director)).toEqual({});
  });

  it("UNIT_TREE quyi bo'linmalarni path orqali qamraydi", () => {
    const head = { ...baseUser, scope: DataScope.UNIT_TREE };
    const where = ticketScopeWhere(head);
    expect(JSON.stringify(where)).toContain('"startsWith":"/1/2/"');
  });

  it("ishtirokchi bo'linma murojaatni ko'radi (UNIT va UNIT_TREE)", () => {
    const tree = JSON.stringify(ticketScopeWhere({ ...baseUser, scope: DataScope.UNIT_TREE }));
    expect(tree).toContain('"participants":{"some":{"orgUnit":{"path":{"startsWith":"/1/2/"}}}}');
    const unit = JSON.stringify(ticketScopeWhere({ ...baseUser, scope: DataScope.UNIT }));
    expect(unit).toContain(`"participants":{"some":{"orgUnitId":${baseUser.orgUnitId}}}`);
  });
});

describe('managesOrgUnit', () => {
  it("UNIT_TREE o'z bo'linmasi va quyi bo'linmalarni boshqaradi", () => {
    const head = { ...baseUser, scope: DataScope.UNIT_TREE };
    expect(managesOrgUnit(head, '/1/2/15/')).toBe(true);
    expect(managesOrgUnit(head, '/1/3/')).toBe(false);
  });

  it("path prefiksi raqam o'rtasida mos kelmaydi (/1/2/ va /1/20/)", () => {
    const head = { ...baseUser, scope: DataScope.UNIT_TREE };
    expect(managesOrgUnit(head, '/1/20/')).toBe(false);
  });
});
