-- Bayi başvurusu.
--
-- Tek yeni tablo ve tek yeni enum; var olan hiçbir satır değişmiyor. Başvuru,
-- `Company` ya da `User` üzerine yazılan bir taslak değil, kendi başına duran
-- bir talep kaydı: hiçbir yetkisi yok, kimseyi içeri almaz. Onaylandığında
-- asıl kayıtlar açılır ve buradaki satır onlara işaret eder.
--
-- `AuditAction` üç değer büyüyor. Yeni enum değerleri bu göç içinde
-- **kullanılmıyor**, yalnızca tanımlanıyor; Postgres eklendikleri işlemde
-- kullanılmalarına izin vermiyor.

-- CreateEnum
CREATE TYPE "DealerApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DEALER_APPLICATION_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE 'DEALER_APPLICATION_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'DEALER_APPLICATION_REJECTED';

-- CreateTable
CREATE TABLE "DealerApplication" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "taxNumber" TEXT,
    "taxOffice" TEXT,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "note" TEXT,
    "status" "DealerApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdCompanyId" TEXT,
    "createdUserId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealerApplication_createdCompanyId_key" ON "DealerApplication"("createdCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "DealerApplication_createdUserId_key" ON "DealerApplication"("createdUserId");

-- CreateIndex
CREATE INDEX "DealerApplication_status_createdAt_idx" ON "DealerApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DealerApplication_email_idx" ON "DealerApplication"("email");

-- AddForeignKey
ALTER TABLE "DealerApplication" ADD CONSTRAINT "DealerApplication_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerApplication" ADD CONSTRAINT "DealerApplication_createdCompanyId_fkey" FOREIGN KEY ("createdCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerApplication" ADD CONSTRAINT "DealerApplication_createdUserId_fkey" FOREIGN KEY ("createdUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
