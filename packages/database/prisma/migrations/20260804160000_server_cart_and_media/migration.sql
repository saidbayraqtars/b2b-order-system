-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'MEDIA_UPLOADED';

-- CreateIndex
-- One open cart per person per customer. Duplicates cannot exist yet (nothing
-- has ever written to Cart), so no cleanup is needed before the constraint.
CREATE UNIQUE INDEX "Cart_companyId_ownerId_key" ON "Cart"("companyId", "ownerId");
