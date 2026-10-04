-- Basit/gelişmiş görünüm tercihi. Varsayılan basit: ileri ayarlar gizli,
-- yetki değişmiyor. Kullanıcı kenar çubuğundan değiştirir.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "advancedView" BOOLEAN NOT NULL DEFAULT false;

