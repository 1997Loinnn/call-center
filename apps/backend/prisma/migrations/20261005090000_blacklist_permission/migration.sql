-- Qora ro'yxatni yuritish huquqi (F-TEL-09: supervisor yuritadi). Seed mavjud rollarni qayta yozmaydi,
-- shuning uchun tizim roliga yangi ruxsat migratsiya orqali qo'shiladi (src/common/roles.ts).
UPDATE "roles"
SET "permissions" = array_append("permissions", 'blacklist.manage')
WHERE "code" = 'SUPERVISOR' AND NOT ('blacklist.manage' = ANY ("permissions"));
