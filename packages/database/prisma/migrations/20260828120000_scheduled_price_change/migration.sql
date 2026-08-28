-- Zamanlı fiyat değişimi kuyruğu.
--
-- Yalnızca ekliyor: `Price` tablosuna dokunulmuyor ve fiyat okuma yolu
-- değişmiyor. Bekleyen satır zamanı gelince `Price`a kopyalanıyor.

CREATE TYPE "PriceChangeStatus" AS ENUM ('PENDING', 'APPLIED', 'CANCELLED', 'FAILED');

CREATE TABLE "ScheduledPriceChange" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "customerGroupId" TEXT,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "status" "PriceChangeStatus" NOT NULL DEFAULT 'PENDING',
    "previousPrice" DECIMAL(12,2),
    "previousCurrency" TEXT,
    "appliedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ScheduledPriceChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduledPriceChange_status_effectiveAt_idx"
    ON "ScheduledPriceChange"("status", "effectiveAt");
CREATE INDEX "ScheduledPriceChange_variantId_idx"
    ON "ScheduledPriceChange"("variantId");

ALTER TABLE "ScheduledPriceChange" ADD CONSTRAINT "ScheduledPriceChange_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledPriceChange" ADD CONSTRAINT "ScheduledPriceChange_customerGroupId_fkey"
    FOREIGN KEY ("customerGroupId") REFERENCES "CustomerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduledPriceChange" ADD CONSTRAINT "ScheduledPriceChange_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
