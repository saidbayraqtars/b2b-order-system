-- F2 çoklu birim: kalemin paket birimleri (koli, palet), paket barkodu ve
-- paket fiyatı. Miktar taban birimde kalır; sipariş satırı paket künyesini
-- (unitName, unitMultiplier) taşır. Birim fiyat ve iskonto 6 ondalığa çıkar:
-- "koli 100 TL" taban birime bölündüğünde kısmi faturada kuruş kaybolmasın.

-- DropIndex
DROP INDEX "Price_variantId_customerGroupId_minQuantity_key";

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "discount" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "unitId" TEXT,
ADD COLUMN     "unitMultiplier" DECIMAL(14,3),
ADD COLUMN     "unitName" TEXT,
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "discount" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "volumeDiscount" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "Price" ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "ReturnItem" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "discount" SET DATA TYPE DECIMAL(18,6);

-- CreateTable
CREATE TABLE "VariantUnit" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "factor" DECIMAL(14,3) NOT NULL,
    "barcode" TEXT,
    "externalCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VariantUnit_barcode_key" ON "VariantUnit"("barcode");

-- CreateIndex
CREATE INDEX "VariantUnit_variantId_idx" ON "VariantUnit"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "VariantUnit_variantId_name_key" ON "VariantUnit"("variantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Price_variantId_customerGroupId_unitId_minQuantity_key" ON "Price"("variantId", "customerGroupId", "unitId", "minQuantity");

-- AddForeignKey
ALTER TABLE "VariantUnit" ADD CONSTRAINT "VariantUnit_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "VariantUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "VariantUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "VariantUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Kısmi tekil indeksler (Prisma bunları bilmiyor, elle). Postgres NULL'ları
-- birbirinden farklı saydığı için bileşik tekil anahtar grupsuz ya da
-- birimsiz satırı korumuyor; her dört durum ayrı indeksle tekil tutulur.
DROP INDEX "Price_variant_default_tier_key";

-- Taban birim, liste fiyatı (grupsuz).
CREATE UNIQUE INDEX "Price_variant_default_tier_key"
  ON "Price" ("variantId", "minQuantity")
  WHERE "customerGroupId" IS NULL AND "unitId" IS NULL;

-- Taban birim, grup fiyatı.
CREATE UNIQUE INDEX "Price_variant_group_tier_key"
  ON "Price" ("variantId", "customerGroupId", "minQuantity")
  WHERE "customerGroupId" IS NOT NULL AND "unitId" IS NULL;

-- Paket birimi, liste fiyatı. Paket + grup bileşik anahtarla korunuyor.
CREATE UNIQUE INDEX "Price_unit_default_tier_key"
  ON "Price" ("unitId", "minQuantity")
  WHERE "customerGroupId" IS NULL AND "unitId" IS NOT NULL;

-- ERP eşitleme türü: paket birimleri (Vega TBLBIRIMLEREX).
ALTER TYPE "ErpSyncKind" ADD VALUE 'UNITS';
