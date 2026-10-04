-- Modüller: kurulum başına açılıp kapanan özellik kümeleri. Yalnızca ekliyor;
-- satır yoksa modül açık sayılıyor, yükselen kurulumda hiçbir ekran kaybolmuyor.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'MODULE_TOGGLED';

-- CreateTable
CREATE TABLE "InstallationModule" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallationModule_pkey" PRIMARY KEY ("key")
);

