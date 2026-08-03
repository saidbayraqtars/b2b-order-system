-- CreateEnum
CREATE TYPE "ReportDataset" AS ENUM ('ORDERS', 'ORDER_ITEMS', 'LEDGER', 'COMPANIES', 'CHECKINS');

-- CreateTable
CREATE TABLE "ReportDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dataset" "ReportDataset" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportDefinition_ownerId_idx" ON "ReportDefinition"("ownerId");

-- CreateIndex
CREATE INDEX "ReportDefinition_dataset_idx" ON "ReportDefinition"("dataset");

-- AddForeignKey
ALTER TABLE "ReportDefinition" ADD CONSTRAINT "ReportDefinition_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
