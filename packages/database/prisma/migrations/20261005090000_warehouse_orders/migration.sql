-- F3 depo bazlı stok: sipariş bir depodan düşer, depo başına kritik seviye ve
-- "sipariş alınmasın" (Vega TBLSTOKENVANTER.KRITIKSEVIYE / SIPARISALINMASIN).
-- Davranış "depo" modülüyle açılır ve modül varsayılan olarak KAPALI
-- (`defaultEnabled: false`, @repo/types modules.ts): ERP'si yalnız toplam stok
-- gönderen kurulumda depo satırları boştur ve kendiliğinden açılan bir modül
-- bütün siparişleri "depoda mal yok" diye reddederdi.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "warehouseId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "warehouseId" TEXT;

-- AlterTable
ALTER TABLE "VariantStock" ADD COLUMN     "blockOrders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minStock" DECIMAL(14,3);

-- CreateIndex
CREATE INDEX "Order_warehouseId_idx" ON "Order"("warehouseId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
