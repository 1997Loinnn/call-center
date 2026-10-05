-- Murojaat matnidagi kalit so'zlar bo'yicha belgilar (F-AI-04).

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "aiFlags" TEXT[] DEFAULT ARRAY[]::TEXT[];
