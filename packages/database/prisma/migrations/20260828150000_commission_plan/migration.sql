-- Plasiyer primi: taban + oran + dönem + hedef çarpanı.
--
-- Yalnızca ekliyor. Kural motoru yok: prim bu dört alandan ibaret.

CREATE TYPE "CommissionBase" AS ENUM ('REVENUE', 'COLLECTION');

CREATE TABLE "CommissionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base" "CommissionBase" NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "period" "TargetPeriod" NOT NULL DEFAULT 'MONTHLY',
    "targetMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    "minBase" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPlan_pkey" PRIMARY KEY ("id")
);

-- Plan ↔ plasiyer: çok-çoka. Bir plasiyere hem ciro hem tahsilat primi
-- atanabilir ve hakediş ikisinin toplamıdır.
CREATE TABLE "_CommissionPlanReps" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_CommissionPlanReps_AB_unique" ON "_CommissionPlanReps"("A", "B");
CREATE INDEX "_CommissionPlanReps_B_index" ON "_CommissionPlanReps"("B");

ALTER TABLE "_CommissionPlanReps" ADD CONSTRAINT "_CommissionPlanReps_A_fkey"
    FOREIGN KEY ("A") REFERENCES "CommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_CommissionPlanReps" ADD CONSTRAINT "_CommissionPlanReps_B_fkey"
    FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prim izni.
UPDATE "User"
SET "permissions" = array_append("permissions", 'commission.manage')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('commission.manage' = ANY("permissions"));
