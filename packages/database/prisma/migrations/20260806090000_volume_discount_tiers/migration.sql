-- Hacim (turnover) discount ladder.
--
-- Everything here is additive and defaulted, so existing rows keep their
-- current prices: no VolumeTier exists yet, and a company on AUTO with an empty
-- ladder earns 0%.

-- CreateEnum
CREATE TYPE "VolumeDiscountMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "VolumeTier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minRevenue" DECIMAL(14,2) NOT NULL,
    "windowMonths" INTEGER NOT NULL DEFAULT 12,
    "discountPercent" DECIMAL(5,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolumeTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VolumeTier_name_key" ON "VolumeTier"("name");

-- CreateIndex
CREATE INDEX "VolumeTier_isActive_sortOrder_idx" ON "VolumeTier"("isActive", "sortOrder");

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "volumeDiscountMode" "VolumeDiscountMode" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "volumeTierId" TEXT;

-- CreateIndex
CREATE INDEX "Company_volumeTierId_idx" ON "Company"("volumeTierId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_volumeTierId_fkey" FOREIGN KEY ("volumeTierId") REFERENCES "VolumeTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: order-time snapshot of the tier, so retiring a rung cannot
-- rewrite what a past order was sold on.
ALTER TABLE "Order" ADD COLUMN     "volumeTierName" TEXT,
ADD COLUMN     "volumeDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable: the share of OrderItem.discount that came from the tier.
-- OrderItem.discount stays the *total* per-unit discount, which is what
-- invoicing already multiplies by the quantity.
ALTER TABLE "OrderItem" ADD COLUMN     "volumeDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;
