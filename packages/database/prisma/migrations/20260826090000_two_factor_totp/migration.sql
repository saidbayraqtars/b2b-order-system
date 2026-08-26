-- İki adımlı doğrulama (TOTP / authenticator uygulaması).
--
-- Beş kolon da nullable ve varsayılanlı: göç mevcut hesapların hiçbirini
-- ikinci adıma tabi kılmaz. Zorunluluk kapısı uygulama tarafında, kullanıcı
-- kurulumu kendisi yaptıktan sonra devreye girer — göç anında herkesi kilitli
-- bir ekrana düşürmek, yükseltmeyi geri alınamaz hâle getirirdi.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'TWO_FACTOR_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE 'TWO_FACTOR_DISABLED';
ALTER TYPE "AuditAction" ADD VALUE 'TWO_FACTOR_RESET';
ALTER TYPE "AuditAction" ADD VALUE 'TWO_FACTOR_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'TWO_FACTOR_BACKUP_USED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totpSecret" TEXT,
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
