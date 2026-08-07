-- Saha operasyonu, dağıtım, etiket şablonları ve stok kırılımı.
--
-- Hepsi tek migration'da çünkü yeni tablolar ve boş bırakılabilir kolonlar —
-- hiçbiri mevcut satırlara dokunmuyor, dolayısıyla yarım uygulanma riski de
-- yok. Rol enum'u ayrı dosyada (PostgreSQL kısıtı).

-- ── ziyaret haritası: adresin koordinatı ──────────────────────────────
ALTER TABLE "Address" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Address" ADD COLUMN "longitude" DOUBLE PRECISION;

-- ── saha hedefleri ────────────────────────────────────────────────────
CREATE TYPE "TargetMetric" AS ENUM ('VISITS', 'REVENUE');
CREATE TYPE "TargetPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

CREATE TABLE "SalesTarget" (
  "id" TEXT NOT NULL,
  "salesRepId" TEXT NOT NULL,
  "metric" "TargetMetric" NOT NULL,
  "period" "TargetPeriod" NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "targetValue" DECIMAL(14,2) NOT NULL,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesTarget_salesRepId_metric_period_periodStart_key"
  ON "SalesTarget" ("salesRepId", "metric", "period", "periodStart");
CREATE INDEX "SalesTarget_salesRepId_periodStart_idx"
  ON "SalesTarget" ("salesRepId", "periodStart");

ALTER TABLE "SalesTarget" ADD CONSTRAINT "SalesTarget_salesRepId_fkey"
  FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesTarget" ADD CONSTRAINT "SalesTarget_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── ziyaret çağrısı ───────────────────────────────────────────────────
CREATE TYPE "VisitRequestStatus" AS ENUM ('OPEN', 'PLANNED', 'DONE', 'CANCELLED');

CREATE TABLE "VisitRequest" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "salesRepId" TEXT,
  "requestedFor" TIMESTAMP(3),
  "note" TEXT,
  "status" "VisitRequestStatus" NOT NULL DEFAULT 'OPEN',
  "sortIndex" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "checkInId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "VisitRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VisitRequest_companyId_idx" ON "VisitRequest" ("companyId");
CREATE INDEX "VisitRequest_salesRepId_status_idx" ON "VisitRequest" ("salesRepId", "status");
CREATE INDEX "VisitRequest_status_requestedFor_idx" ON "VisitRequest" ("status", "requestedFor");

ALTER TABLE "VisitRequest" ADD CONSTRAINT "VisitRequest_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitRequest" ADD CONSTRAINT "VisitRequest_salesRepId_fkey"
  FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisitRequest" ADD CONSTRAINT "VisitRequest_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── dağıtım: sevkiyatın kuryesi ve teslim kanıtı ──────────────────────
ALTER TABLE "Shipment" ADD COLUMN "courierId" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN "receivedByName" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "proofPhotoUrl" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "deliveryNote" TEXT;

CREATE INDEX "Shipment_courierId_deliveredAt_idx" ON "Shipment" ("courierId", "deliveredAt");

ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_courierId_fkey"
  FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── etiket / fiş şablonları ───────────────────────────────────────────
CREATE TYPE "LabelTemplateKind" AS ENUM ('CARGO_LABEL', 'ORDER_RECEIPT', 'DELIVERY_RECEIPT');

CREATE TABLE "LabelTemplate" (
  "id" TEXT NOT NULL,
  "kind" "LabelTemplateKind" NOT NULL,
  "name" TEXT NOT NULL,
  "widthMm" INTEGER NOT NULL,
  "heightMm" INTEGER,
  "blocks" JSONB NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LabelTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LabelTemplate_kind_isActive_idx" ON "LabelTemplate" ("kind", "isActive");

-- ── stok kartı alanları (ERP karşılıkları) ────────────────────────────
ALTER TABLE "ProductVariant" ADD COLUMN "costPrice" DECIMAL(12,2);
ALTER TABLE "ProductVariant" ADD COLUMN "unit" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN "minStock" INTEGER;
ALTER TABLE "ProductVariant" ADD COLUMN "shelfCode" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- ── depo ve depo bazlı stok ───────────────────────────────────────────
CREATE TABLE "Warehouse" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse" ("code");

CREATE TABLE "VariantStock" (
  "id" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "onHand" INTEGER NOT NULL DEFAULT 0,
  "reserved" INTEGER NOT NULL DEFAULT 0,
  "erpSyncedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VariantStock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VariantStock_variantId_warehouseId_key"
  ON "VariantStock" ("variantId", "warehouseId");
CREATE INDEX "VariantStock_warehouseId_idx" ON "VariantStock" ("warehouseId");

ALTER TABLE "VariantStock" ADD CONSTRAINT "VariantStock_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VariantStock" ADD CONSTRAINT "VariantStock_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
