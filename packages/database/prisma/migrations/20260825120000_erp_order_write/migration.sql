-- AlterEnum
ALTER TYPE "ErpSyncKind" ADD VALUE 'ORDER_WRITE';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "erpDocumentInd" INTEGER,
ADD COLUMN     "erpDocumentNo" TEXT,
ADD COLUMN     "erpPushError" TEXT,
ADD COLUMN     "erpPushedAt" TIMESTAMP(3),
ADD COLUMN     "erpPushedById" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_erpPushedById_fkey" FOREIGN KEY ("erpPushedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Siparişi ERP'ye aktarma izni.
--
-- Aynı gerekçe (bkz. 20260810160000_system_update_permission): kayıt defterine
-- izin eklemek yükselten kurulumda kimsenin satırına yazmaz, kimsede olmayan
-- izin kimseye verilemez, düğme herkeste kilitli kalırdı.
UPDATE "User"
SET "permissions" = array_append("permissions", 'erp.push')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('erp.push' = ANY("permissions"));
