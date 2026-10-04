-- Özel kodlar: ürüne ve firmaya 10'ar serbest sınıflandırma alanı
-- (Vega'nın KOD1..KOD21 deseni, kılavuz §64). Yalnızca ekliyor; mevcut satırların
-- hepsi boş kodla açılıyor ve hiçbir ekranın davranışı değişmiyor.

-- CreateEnum
CREATE TYPE "CustomCodeEntity" AS ENUM ('PRODUCT', 'COMPANY');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "code1" VARCHAR(100),
ADD COLUMN     "code10" VARCHAR(100),
ADD COLUMN     "code2" VARCHAR(100),
ADD COLUMN     "code3" VARCHAR(100),
ADD COLUMN     "code4" VARCHAR(100),
ADD COLUMN     "code5" VARCHAR(100),
ADD COLUMN     "code6" VARCHAR(100),
ADD COLUMN     "code7" VARCHAR(100),
ADD COLUMN     "code8" VARCHAR(100),
ADD COLUMN     "code9" VARCHAR(100);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "code1" VARCHAR(100),
ADD COLUMN     "code10" VARCHAR(100),
ADD COLUMN     "code2" VARCHAR(100),
ADD COLUMN     "code3" VARCHAR(100),
ADD COLUMN     "code4" VARCHAR(100),
ADD COLUMN     "code5" VARCHAR(100),
ADD COLUMN     "code6" VARCHAR(100),
ADD COLUMN     "code7" VARCHAR(100),
ADD COLUMN     "code8" VARCHAR(100),
ADD COLUMN     "code9" VARCHAR(100);

-- CreateTable
CREATE TABLE "CustomCodeField" (
    "id" TEXT NOT NULL,
    "entity" "CustomCodeEntity" NOT NULL,
    "slot" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "showInCatalogFilter" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomCodeField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomCodeField_entity_slot_key" ON "CustomCodeField"("entity", "slot");

-- CreateIndex
CREATE INDEX "Company_code1_idx" ON "Company"("code1");

-- CreateIndex
CREATE INDEX "Company_code2_idx" ON "Company"("code2");

-- CreateIndex
CREATE INDEX "Company_code3_idx" ON "Company"("code3");

-- CreateIndex
CREATE INDEX "Company_code4_idx" ON "Company"("code4");

-- CreateIndex
CREATE INDEX "Company_code5_idx" ON "Company"("code5");

-- CreateIndex
CREATE INDEX "Company_code6_idx" ON "Company"("code6");

-- CreateIndex
CREATE INDEX "Company_code7_idx" ON "Company"("code7");

-- CreateIndex
CREATE INDEX "Company_code8_idx" ON "Company"("code8");

-- CreateIndex
CREATE INDEX "Company_code9_idx" ON "Company"("code9");

-- CreateIndex
CREATE INDEX "Company_code10_idx" ON "Company"("code10");

-- CreateIndex
CREATE INDEX "Product_code1_idx" ON "Product"("code1");

-- CreateIndex
CREATE INDEX "Product_code2_idx" ON "Product"("code2");

-- CreateIndex
CREATE INDEX "Product_code3_idx" ON "Product"("code3");

-- CreateIndex
CREATE INDEX "Product_code4_idx" ON "Product"("code4");

-- CreateIndex
CREATE INDEX "Product_code5_idx" ON "Product"("code5");

-- CreateIndex
CREATE INDEX "Product_code6_idx" ON "Product"("code6");

-- CreateIndex
CREATE INDEX "Product_code7_idx" ON "Product"("code7");

-- CreateIndex
CREATE INDEX "Product_code8_idx" ON "Product"("code8");

-- CreateIndex
CREATE INDEX "Product_code9_idx" ON "Product"("code9");

-- CreateIndex
CREATE INDEX "Product_code10_idx" ON "Product"("code10");

-- Yuva numarası kolon adına dönüşüyor (`code{slot}`); 1..10 dışı bir satır
-- hiçbir kolona karşılık gelmez.
ALTER TABLE "CustomCodeField" ADD CONSTRAINT "CustomCodeField_slot_check"
    CHECK ("slot" BETWEEN 1 AND 10);
