-- ERP köprüsü: ajan, çalıştırma kaydı, eşleşmeyen satırlar.
--
-- Müşterinin ERP'si (ilk müşteride VegaWin A5) muhasebecinin çalıştığı yer ve
-- e-fatura zaten orada kesiliyor. Bu sistem ERP'ye ağ üzerinden uzanmaz:
-- müşterinin kendi makinesinde küçük bir **ajan** çalışır, ERP'yi okur ve
-- normalize veriyi buraya HTTPS ile gönderir.
--
-- ERP şemasını bilen taraf ajandır, bu sistem değil. Bu bir güvenlik kararı:
-- alternatifi — kendisine verilen SQL'i çalıştıran bir ajan — bu sunucuyu ele
-- geçiren birinin müşterinin muhasebe veritabanında keyfi SQL çalıştırması
-- demekti.
--
-- Eşleme anahtarları (Company.externalCode, ProductVariant.externalCode) zaten
-- vardı; eklenen tek alan ERP'nin bildirdiği bakiye ve tazelik damgaları.

-- CreateEnum
CREATE TYPE "ErpSyncKind" AS ENUM ('CUSTOMERS', 'STOCK', 'PRICES', 'BALANCES');

-- CreateEnum
CREATE TYPE "ErpSyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- AlterTable: ERP'nin bildirdiği bakiye AYRI kolonda durur.
-- currentBalance bizim kendi Transaction defterimizden türer ve her ekran ona
-- göre toplam alır; başka bir defterden hesaplanmış bir sayıyla üzerine yazmak,
-- bakiyeyi yanındaki ekstreyle çelişir hâle getirirdi.
ALTER TABLE "Company" ADD COLUMN "erpBalance" DECIMAL(14,2),
ADD COLUMN "erpSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN "erpSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ErpAgent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "erp" TEXT NOT NULL DEFAULT 'vega',
    "tokenHash" TEXT NOT NULL,
    "tokenHint" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "lastSeenIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpAgent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ErpAgent_name_key" ON "ErpAgent"("name");

-- CreateIndex: the token is looked up by its hash on every agent request.
CREATE UNIQUE INDEX "ErpAgent_tokenHash_key" ON "ErpAgent"("tokenHash");

-- CreateTable
CREATE TABLE "ErpSyncRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "kind" "ErpSyncKind" NOT NULL,
    "status" "ErpSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "received" INTEGER NOT NULL DEFAULT 0,
    "applied" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ErpSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErpSyncRun_kind_startedAt_idx" ON "ErpSyncRun"("kind", "startedAt");

-- CreateIndex
CREATE INDEX "ErpSyncRun_agentId_startedAt_idx" ON "ErpSyncRun"("agentId", "startedAt");

-- CreateTable
CREATE TABLE "ErpSyncIssue" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "externalCode" TEXT NOT NULL,
    "label" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpSyncIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErpSyncIssue_runId_idx" ON "ErpSyncIssue"("runId");

-- CreateIndex
CREATE INDEX "ErpSyncIssue_externalCode_idx" ON "ErpSyncIssue"("externalCode");

-- AddForeignKey
ALTER TABLE "ErpSyncRun" ADD CONSTRAINT "ErpSyncRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ErpAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpSyncIssue" ADD CONSTRAINT "ErpSyncIssue_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ErpSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
