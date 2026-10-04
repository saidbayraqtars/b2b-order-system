-- Kesirli miktar (F1): kilo ve metre satan kurulum 0,75 kg tutabilsin.
--
-- Miktar taşıyan 15 kolon (en az sipariş miktarı dahil) tam sayıdan
-- DECIMAL(14,3)'e geçiyor. Tam sayı değerler aynen korunur (12 → 12.000);
-- veri kaybı yok. Kalemin girişte kaç
-- ondalık alabildiğini yeni `quantityScale` söyler; varsayılan 0, yani
-- kesirli satış kalem kalem, bilerek açılır.

-- AlterTable
ALTER TABLE "CartItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "InvoiceItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "quantityInvoiced" SET DEFAULT 0,
ALTER COLUMN "quantityInvoiced" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "quantityShipped" SET DEFAULT 0,
ALTER COLUMN "quantityShipped" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "quantityScale" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "moqUnits" SET DEFAULT 1,
ALTER COLUMN "moqUnits" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "stock" SET DEFAULT 0,
ALTER COLUMN "stock" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "minStock" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "ReturnItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "ShipmentItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "StockLot" ALTER COLUMN "onHand" SET DEFAULT 0,
ALTER COLUMN "onHand" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "StockMovement" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "balanceAfter" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "VariantStock" ALTER COLUMN "onHand" SET DEFAULT 0,
ALTER COLUMN "onHand" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "reserved" SET DEFAULT 0,
ALTER COLUMN "reserved" SET DATA TYPE DECIMAL(14,3);

