-- Tahsilat araması: "bugün kimi aradım, ne dedi".
--
-- Yalnızca ekliyor. Ekle-only tablo: bir arama olmuş bir şeydir, düzeltilmez;
-- yanlış girilen sonucun üstüne yeni bir kayıt yazılır.

CREATE TYPE "CollectionOutcome" AS ENUM ('PROMISED', 'CHEQUE', 'UNREACHABLE', 'REFUSED', 'NO_PROMISE');

CREATE TABLE "CollectionCall" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "outcome" "CollectionOutcome" NOT NULL,
    "promisedDate" TIMESTAMP(3),
    "promisedAmount" DECIMAL(14,2),
    "note" TEXT,
    "calledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CollectionCall_companyId_createdAt_idx" ON "CollectionCall"("companyId", "createdAt");
CREATE INDEX "CollectionCall_promisedDate_idx" ON "CollectionCall"("promisedDate");

ALTER TABLE "CollectionCall" ADD CONSTRAINT "CollectionCall_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionCall" ADD CONSTRAINT "CollectionCall_calledById_fkey"
    FOREIGN KEY ("calledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
