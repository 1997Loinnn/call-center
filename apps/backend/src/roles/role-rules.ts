import { ALL_PERMISSIONS, Permission } from '../common/permissions';

/** Rol kodi: lotin bosh harflari, raqam va "_" (masalan, SHIFT_LEAD). */
export const ROLE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;

/** Noma'lum ruxsat kodlarini qaytaradi (bo'sh massiv — hammasi to'g'ri). */
export function unknownPermissions(codes: string[]): string[] {
  return codes.filter((code) => !(ALL_PERMISSIONS as string[]).includes(code));
}

/** Takrorlarni olib tashlab, katalogdagi tartibda saralaydi: audit va solishtirish barqaror bo'ladi. */
export function normalizePermissions(codes: string[]): string[] {
  const set = new Set(codes);
  return (ALL_PERMISSIONS as string[]).filter((code) => set.has(code));
}

/** Audit uchun: qaysi ruxsatlar qo'shildi va olib tashlandi. */
export function diffPermissions(before: string[], after: string[]): { added: string[]; removed: string[] } {
  return {
    added: after.filter((code) => !before.includes(code)),
    removed: before.filter((code) => !after.includes(code)),
  };
}

/** Rol o'zgarishi tizimni boshqaruvsiz qoldirishi mumkinmi (users.manage olib tashlanyapti). */
export const losesUserManagement = (before: string[], after: string[]): boolean =>
  before.includes(Permission.UsersManage) && !after.includes(Permission.UsersManage);
