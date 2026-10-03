import { DataScope, Prisma } from '@prisma/client';
import { AuthUser } from './auth-user';
import { Permission } from './permissions';

const SCOPE_ORDER: DataScope[] = [DataScope.OWN, DataScope.UNIT, DataScope.UNIT_TREE, DataScope.ALL];

/** Bir nechta rol bo'lsa, eng keng ko'rish doirasi olinadi. */
export function widestScope(scopes: DataScope[]): DataScope {
  return scopes.reduce<DataScope>(
    (widest, scope) => (SCOPE_ORDER.indexOf(scope) > SCOPE_ORDER.indexOf(widest) ? scope : widest),
    DataScope.OWN,
  );
}

export function hasPermission(user: AuthUser, permission: string): boolean {
  return user.permissions.includes(permission);
}

/**
 * Foydalanuvchi ko'ra oladigan murojaatlar sharti (TZ 4-bo'lim).
 * Maxfiy murojaatlar (korrupsiya xabarlari) faqat tickets.confidential ruxsati bilan ko'rinadi.
 */
export function ticketScopeWhere(user: AuthUser): Prisma.TicketWhereInput {
  const own: Prisma.TicketWhereInput[] = [{ createdById: user.id }, { assigneeId: user.id }];
  let visibility: Prisma.TicketWhereInput;

  switch (user.scope) {
    case DataScope.ALL:
      visibility = {};
      break;
    case DataScope.UNIT_TREE:
      visibility = {
        OR: [
          ...own,
          { assignedOrgUnit: { path: { startsWith: user.orgUnitPath } } },
          { createdBy: { orgUnit: { path: { startsWith: user.orgUnitPath } } } },
        ],
      };
      break;
    case DataScope.UNIT:
      visibility = {
        OR: [...own, { assignedOrgUnitId: user.orgUnitId }, { createdBy: { orgUnitId: user.orgUnitId } }],
      };
      break;
    default:
      visibility = { OR: own };
  }

  if (hasPermission(user, Permission.TicketsConfidential)) {
    return visibility;
  }
  return { AND: [visibility, { isConfidential: false }] };
}

/** Foydalanuvchi ko'ra oladigan qo'ng'iroqlar sharti. */
export function callScopeWhere(user: AuthUser): Prisma.CallWhereInput {
  switch (user.scope) {
    case DataScope.ALL:
      return {};
    case DataScope.UNIT_TREE:
      return { agent: { orgUnit: { path: { startsWith: user.orgUnitPath } } } };
    case DataScope.UNIT:
      return { agent: { orgUnitId: user.orgUnitId } };
    default:
      return { agentId: user.id };
  }
}

/** Foydalanuvchi berilgan bo'linmani (yoki uning ajdodini) boshqaradimi. */
export function managesOrgUnit(user: AuthUser, orgUnitPath: string | null | undefined): boolean {
  if (user.scope === DataScope.ALL) return true;
  if (!orgUnitPath) return false;
  if (user.scope === DataScope.UNIT_TREE) return orgUnitPath.startsWith(user.orgUnitPath);
  return orgUnitPath === user.orgUnitPath;
}
