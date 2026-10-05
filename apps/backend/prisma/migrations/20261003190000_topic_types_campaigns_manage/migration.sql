-- Mavzu operator kartasida qaysi murojaat turlarida chiqadi (bo'sh = barcha turlarda).
-- CRM sozlamalari → Toifalar va mavzular.

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "ticketTypes" "TicketType"[] DEFAULT ARRAY[]::"TicketType"[];

-- Chiquvchi kampaniyalarni boshqarish huquqi supervisor tizim roliga. Seed mavjud rollarni qayta
-- yozmaydi, shuning uchun tizim roliga yangi ruxsat migratsiya orqali qo'shiladi (src/common/roles.ts).
UPDATE "roles"
SET "permissions" = array_append("permissions", 'campaigns.manage')
WHERE "code" = 'SUPERVISOR' AND NOT ('campaigns.manage' = ANY ("permissions"));
