-- Order-side settlement: widen PaymentMethod, add named vade options, and let a
-- company restrict which of each its buyers may pick.

-- New members on an existing enum. Postgres cannot add these inside the same
-- transaction that uses them, but nothing here uses them, so a plain ALTER is fine.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'BANK_TRANSFER';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CASH';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CHEQUE';

-- Empty array = no restriction, so every existing company keeps every method.
ALTER TABLE "Company"
  ADD COLUMN "allowedPaymentMethods" "PaymentMethod"[] DEFAULT ARRAY[]::"PaymentMethod"[];

CREATE TABLE "PaymentTerm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTerm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentTerm_name_key" ON "PaymentTerm"("name");
CREATE INDEX "PaymentTerm_isActive_sortOrder_idx" ON "PaymentTerm"("isActive", "sortOrder");

-- Implicit m-n join table (Prisma naming: _<relationName>).
CREATE TABLE "_CompanyPaymentTerms" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_CompanyPaymentTerms_AB_unique" ON "_CompanyPaymentTerms"("A", "B");
CREATE INDEX "_CompanyPaymentTerms_B_index" ON "_CompanyPaymentTerms"("B");

ALTER TABLE "_CompanyPaymentTerms" ADD CONSTRAINT "_CompanyPaymentTerms_A_fkey"
  FOREIGN KEY ("A") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_CompanyPaymentTerms" ADD CONSTRAINT "_CompanyPaymentTerms_B_fkey"
  FOREIGN KEY ("B") REFERENCES "PaymentTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
