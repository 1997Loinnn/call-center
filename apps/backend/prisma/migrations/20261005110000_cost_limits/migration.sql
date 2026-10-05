-- Oylik xarajat limitlari (F-BIL-05): bo'linma yoki operator uchun, ogohlantirish foizi bilan.

-- CreateTable
CREATE TABLE "cost_limits" (
    "id" SERIAL NOT NULL,
    "orgUnitId" INTEGER,
    "userId" INTEGER,
    "monthlyAmount" DECIMAL(14,2) NOT NULL,
    "warnPercent" INTEGER NOT NULL DEFAULT 80,
    "notifiedMonth" VARCHAR(7),
    "notifiedLevel" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_limits_orgUnitId_idx" ON "cost_limits"("orgUnitId");

-- CreateIndex
CREATE INDEX "cost_limits_userId_idx" ON "cost_limits"("userId");

-- AddForeignKey
ALTER TABLE "cost_limits" ADD CONSTRAINT "cost_limits_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "org_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_limits" ADD CONSTRAINT "cost_limits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
