import { OrgUnitType } from '@prisma/client';

export interface FlatOrgUnit {
  id: number;
  parentId: number | null;
  type: OrgUnitType;
  code: string;
  name: string;
  path: string;
  isActive: boolean;
  regionId: number | null;
}

export interface OrgTreeNode extends FlatOrgUnit {
  children: OrgTreeNode[];
}

/** Tekis ro'yxatdan daraxt quradi. Ota-bo'linmasi ro'yxatda yo'q yozuvlar ildiz bo'ladi. */
export function buildOrgTree(units: FlatOrgUnit[]): OrgTreeNode[] {
  const nodes = new Map<number, OrgTreeNode>();
  for (const unit of units) nodes.set(unit.id, { ...unit, children: [] });

  const roots: OrgTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId === null ? undefined : nodes.get(node.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortRecursive = (list: OrgTreeNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name, 'uz'));
    list.forEach((node) => sortRecursive(node.children));
  };
  sortRecursive(roots);
  return roots;
}

export function childPath(parentPath: string | null, id: number): string {
  return `${parentPath ?? '/'}${id}/`;
}
