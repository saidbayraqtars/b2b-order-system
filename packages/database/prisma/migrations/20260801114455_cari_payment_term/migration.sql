-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "paymentTermDays" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Transaction_companyId_createdAt_idx" ON "Transaction"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_recordedById_createdAt_idx" ON "Transaction"("recordedById", "createdAt");
