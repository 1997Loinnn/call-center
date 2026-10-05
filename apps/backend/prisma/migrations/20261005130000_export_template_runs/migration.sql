-- Eksport shablonlari jadval bo'yicha emailga yuboriladi (F-REP-05): oxirgi yuborish natijasi.

-- AlterTable
ALTER TABLE "export_templates" ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "lastRunNote" TEXT,
ADD COLUMN     "lastRunStatus" VARCHAR(16);
