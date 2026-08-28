-- Cari mutabakat: dönem sonu mektubu ve müşterinin cevabı.
--
-- Yalnızca ekliyor. Cevap defteri oynatmıyor — "mutabıkım" bir beyandır,
-- bir işlem değil.

CREATE TYPE "ReconciliationStatus" AS ENUM ('SENT', 'AGREED', 'DISPUTED', 'CANCELLED');

CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "totalDebit" DECIMAL(14,2) NOT NULL,
    "totalCredit" DECIMAL(14,2) NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'SENT',
    "responseNote" TEXT,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Reconciliation_companyId_periodEnd_idx" ON "Reconciliation"("companyId", "periodEnd");
CREATE INDEX "Reconciliation_status_createdAt_idx" ON "Reconciliation"("status", "createdAt");

ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_respondedById_fkey"
    FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mutabakat izni. Süper adminlere veriliyor; kimsede olmayan izin kimseye
-- verilemediği için ekran aksi hâlde herkese kapalı kalırdı.
UPDATE "User"
SET "permissions" = array_append("permissions", 'reconciliation.manage')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('reconciliation.manage' = ANY("permissions"));
