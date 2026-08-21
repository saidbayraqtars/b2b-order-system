-- AlterEnum
ALTER TYPE "ReportDataset" ADD VALUE 'STOCK_LOTS';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "pricingUnit" TEXT,
ADD COLUMN     "unitFactor" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "expiryWarningDays" INTEGER,
ADD COLUMN     "isVariableWeight" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pricingUnit" TEXT,
ADD COLUMN     "shelfLifeDays" INTEGER,
ADD COLUMN     "tracksLots" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unitFactor" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "lotId" TEXT;

-- CreateTable
CREATE TABLE "StockLot" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "producedAt" TIMESTAMP(3),
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockLot_variantId_expiryDate_idx" ON "StockLot"("variantId", "expiryDate");

-- CreateIndex
CREATE INDEX "StockLot_expiryDate_idx" ON "StockLot"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "StockLot_variantId_code_key" ON "StockLot"("variantId", "code");

-- CreateIndex
CREATE INDEX "StockMovement_lotId_occurredAt_idx" ON "StockMovement"("lotId", "occurredAt");

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

