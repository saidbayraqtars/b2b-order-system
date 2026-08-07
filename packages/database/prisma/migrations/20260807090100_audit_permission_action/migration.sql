-- Yetki değişikliği kendi denetim eylemi. Rol değişikliğiyle aynı ağırlıkta
-- olduğu için güvenlik ekranında da varsayılan olarak listelenir.
--
-- Ayrı migration: PostgreSQL yeni bir enum değerini ekleyen işlemle *aynı*
-- işlem içinde kullanılmasına izin vermez. Kolon backfill'i ile aynı dosyada
-- kalsa, bir sonraki adımda bu değeri yazan herhangi bir ifade patlardı.
ALTER TYPE "AuditAction" ADD VALUE 'USER_PERMISSIONS_CHANGED';
