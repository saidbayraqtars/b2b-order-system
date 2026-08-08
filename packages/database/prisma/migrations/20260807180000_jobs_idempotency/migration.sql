-- Zamanlanmış işler + tahsilatta tekrar anahtarı.
--
-- `JobSchedule.nextRunAt` sahiplenme alanı: işi alan kopya satırı tek bir
-- UPDATE ile ileri atıyor, alamayan hiç başlamıyor. İki kopya aynı anda
-- çalıştığında denetim kaydının iki kez temizlenmesini engelleyen şey bu.
--
-- `Transaction.idempotencyKey` tekil: aynı tahsilatı iki kez yazmanın önündeki
-- tek gerçek engel. Uygulama kodundaki "önce bak sonra yaz" yarışa açıktı;
-- burada ikinci isteği veritabanı reddediyor. Mevcut satırlarda NULL, ve
-- PostgreSQL NULL'ları tekillikte ayrı saydığı için eski kayıtlar çakışmıyor.

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE "JobSchedule" (
    "name" TEXT NOT NULL,
    "intervalMinutes" INTEGER NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastSummary" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSchedule_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "summary" TEXT,
    "error" TEXT,
    "triggeredById" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobSchedule_isEnabled_nextRunAt_idx" ON "JobSchedule"("isEnabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "JobRun_name_startedAt_idx" ON "JobRun"("name", "startedAt");

-- CreateIndex
CREATE INDEX "JobRun_startedAt_idx" ON "JobRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
