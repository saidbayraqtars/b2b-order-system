-- Sayfa düzeni: vitrinin blok dizilimi artık veri.
--
-- Sayfa başına tek satır (`key` tekil). `blocks` JSON çünkü blok tipleri kod
-- sürümüyle birlikte büyüyor ve her yeni blok bir göç istememeli; şeması
-- sunucudaki kayıt defterinde doğrulanıyor.
--
-- Satır **oluşturulmuyor**: kaydı olmayan sayfa varsayılan düzenle çiziliyor
-- (bugüne kadarki sıranın ta kendisi). Böylece yükselten kurulumda vitrin
-- görünüş olarak hiç değişmiyor.

CREATE TABLE "PageLayout" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageLayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageLayout_key_key" ON "PageLayout"("key");

ALTER TABLE "PageLayout" ADD CONSTRAINT "PageLayout_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
