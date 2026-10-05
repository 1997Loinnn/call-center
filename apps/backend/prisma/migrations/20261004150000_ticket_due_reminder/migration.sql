-- Murojaat muddati yaqinlashgani haqida eslatma yuborilgan vaqt (F-CRM-05). Eskalatsiya vaqti escalatedAt da.

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "dueSoonNotifiedAt" TIMESTAMP(3);
