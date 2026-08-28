-- Yönetici panosunun gecelik özeti.
--
-- Kohort matrisi, RFM ve ciro köprüsü her sayfa açılışında hesaplanamaz: üçü de
-- bütün sipariş geçmişini tarıyor. Gecelik iş hesaplıyor, ekran okuyor. Anlık
-- kutular (bugünün cirosu, açık sipariş) bu tablodan **okunmuyor** — onlar
-- canlı, çünkü dün geceden bir "bugün" olmaz.
--
-- `key` bir bölümün adı ("growth", "customers", "products"); her bölümün tek
-- bir güncel satırı var ve gece işi onu üstüne yazıyor. Sürüm geçmişi
-- tutulmuyor: pano dünkü kohort matrisini sormuyor, bugünküyü soruyor.
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalyticsSnapshot_key_key" ON "AnalyticsSnapshot"("key");
