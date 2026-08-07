-- Döviz kuru + siparişte kur anlık görüntüsü.
--
-- Defter TL kalıyor: `OrderItem.unitPrice` ve `lineTotal` her zaman TL. Yeni üç
-- kolon yalnızca belgede "100 USD × 34,2150" satırını basabilmek için. Kur
-- siparişte donduğu için, kur yarın değişse de dünkü siparişin tutarı
-- değişmiyor — mevcut satırların hepsi TRY/1 varsayılanıyla doğru kalıyor.

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "listCurrency" TEXT NOT NULL DEFAULT 'TRY',
ADD COLUMN     "listUnitPrice" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeRate_currency_validFrom_idx" ON "ExchangeRate"("currency", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_currency_validFrom_key" ON "ExchangeRate"("currency", "validFrom");

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
