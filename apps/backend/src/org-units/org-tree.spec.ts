import { OrgUnitType } from '@prisma/client';
import { buildOrgTree, childPath, FlatOrgUnit } from './org-tree';

const unit = (id: number, parentId: number | null, name: string): FlatOrgUnit => ({
  id,
  parentId,
  name,
  type: OrgUnitType.DEPARTMENT,
  code: `u${id}`,
  path: '',
  isActive: true,
  regionId: null,
});

describe('buildOrgTree', () => {
  it("bo'linmalarni ota-bola munosabati bo'yicha joylaydi va nom bo'yicha saralaydi", () => {
    const tree = buildOrgTree([
      unit(1, null, 'Kadastr agentligi'),
      unit(3, 1, 'Markaziy apparat'),
      unit(2, 1, 'Call-markaz 1097'),
      unit(4, 3, "Yuridik bo'lim"),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.name)).toEqual(['Call-markaz 1097', 'Markaziy apparat']);
    expect(tree[0].children[1].children[0].name).toBe("Yuridik bo'lim");
  });
});

describe('childPath', () => {
  it('materialized path quradi', () => {
    expect(childPath(null, 1)).toBe('/1/');
    expect(childPath('/1/5/', 23)).toBe('/1/5/23/');
  });
});
