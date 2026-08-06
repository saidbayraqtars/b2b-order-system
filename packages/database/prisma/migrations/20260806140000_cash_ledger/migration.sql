-- Kasa & banka defteri.
--
-- Until now a peşin order (nakit / havale / kart) wrote nothing anywhere: the
-- cari ledger only hears about debt, and a paid order has none. This is the
-- second ledger — what we hold and where — plus the mapping that says which
-- account a given payment method settles into.
--
-- Everything is additive. The one seeded row ("Merkez Kasa") exists so that an
-- upgraded installation has somewhere to put money from the first order after
-- the deploy, without an admin having to open a screen first.

-- CreateEnum
CREATE TYPE "CashAccountKind" AS ENUM ('CASH', 'BANK', 'POS');

-- CreateEnum
CREATE TYPE "CashDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CashMovementSource" AS ENUM ('ORDER', 'COLLECTION', 'MANUAL', 'TRANSFER');

-- AlterEnum: the till is a dataset the report builder can read.
ALTER TYPE "ReportDataset" ADD VALUE 'CASH';

-- CreateTable
CREATE TABLE "CashAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CashAccountKind" NOT NULL DEFAULT 'CASH',
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "bankName" TEXT,
    "iban" TEXT,
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashAccount_name_key" ON "CashAccount"("name");

-- CreateIndex
CREATE INDEX "CashAccount_isActive_sortOrder_idx" ON "CashAccount"("isActive", "sortOrder");

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "CashDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "source" "CashMovementSource" NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" TEXT,
    "transactionId" TEXT,
    "reversalOfId" TEXT,
    "counterpartId" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_transactionId_key" ON "CashMovement"("transactionId");

-- CreateIndex: one reversal per entry, enforced here rather than by a
-- check-then-write in application code.
CREATE UNIQUE INDEX "CashMovement_reversalOfId_key" ON "CashMovement"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_counterpartId_key" ON "CashMovement"("counterpartId");

-- CreateIndex
CREATE INDEX "CashMovement_accountId_occurredAt_idx" ON "CashMovement"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "CashMovement_occurredAt_idx" ON "CashMovement"("occurredAt");

-- CreateIndex
CREATE INDEX "CashMovement_orderId_idx" ON "CashMovement"("orderId");

-- CreateIndex
CREATE INDEX "CashMovement_source_occurredAt_idx" ON "CashMovement"("source", "occurredAt");

-- CreateTable
CREATE TABLE "PaymentMethodAccount" (
    "method" "PaymentMethod" NOT NULL,
    "accountId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethodAccount_pkey" PRIMARY KEY ("method")
);

-- CreateIndex
CREATE INDEX "PaymentMethodAccount_accountId_idx" ON "PaymentMethodAccount"("accountId");

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CashAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "CashMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_counterpartId_fkey" FOREIGN KEY ("counterpartId") REFERENCES "CashMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethodAccount" ADD CONSTRAINT "PaymentMethodAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CashAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The default till. Written here and not in the seed so that an existing
-- installation, which never runs the seed again, also gets one.
INSERT INTO "CashAccount" ("id", "name", "kind", "isDefault", "sortOrder", "createdAt", "updatedAt")
VALUES ('cash_default_till', 'Merkez Kasa', 'CASH', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
