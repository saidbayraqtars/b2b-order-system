-- Field operations move to the web: collections gain a real method and a
-- reversal entry, visits record which application wrote them.

-- CreateEnum
CREATE TYPE "CollectionMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'PROMISSORY_NOTE', 'CREDIT_CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "FieldEntrySource" AS ENUM ('MOBILE', 'WEB');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "collectionMethod" "CollectionMethod",
ADD COLUMN "reversalOfId" TEXT;

-- AlterTable: existing visits all came from the phone app.
ALTER TABLE "CheckIn" ADD COLUMN "source" "FieldEntrySource" NOT NULL DEFAULT 'MOBILE';

-- CreateIndex: one collection can be reversed at most once, enforced by the database.
CREATE UNIQUE INDEX "Transaction_reversalOfId_key" ON "Transaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "CheckIn_salesRepId_checkOutAt_idx" ON "CheckIn"("salesRepId", "checkOutAt");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
