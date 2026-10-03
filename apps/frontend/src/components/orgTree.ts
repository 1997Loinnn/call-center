import type { OrgTreeNode } from '../api/types';

export interface TreeSelectNode {
  value: number;
  title: string;
  children: TreeSelectNode[];
}

/** Tashkiliy tuzilma daraxtini TreeSelect formatiga o'giradi. */
export function toTreeSelect(nodes: OrgTreeNode[]): TreeSelectNode[] {
  return nodes.map((node) => ({ value: node.id, title: node.name, children: toTreeSelect(node.children) }));
}
