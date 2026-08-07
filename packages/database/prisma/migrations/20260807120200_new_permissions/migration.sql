-- Yeni izinler: hedef koyma, teslim onayı, etiket şablonu yönetimi.
--
-- Kayıt defterine izin eklemek yetmiyor: mevcut kurulumlarda hiç kimsenin
-- satırında bu anahtarlar yok, dolayısıyla yeni ekranı kimse açamaz ve kimse
-- kimseye veremez (kendinde olmayan izin verilemiyor). Bu yüzden her yeni izin,
-- eklendiği sürümde süper adminlere yazılır — kurulumun sahibi her zaman
-- dağıtabilecek durumda kalmalı.
--
-- `array_append` kullanılıyor, `||` değil: `dizi || 'metin'` PostgreSQL'de
-- metni dizi literali sanıp "malformed array literal" ile patlıyor.
-- Koşuldaki `= ANY` sayesinde migration ikinci kez çalışsa da liste ikizlenmez.

UPDATE "User"
SET "permissions" = array_append("permissions", 'targets.manage')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('targets.manage' = ANY("permissions"));

UPDATE "User"
SET "permissions" = array_append("permissions", 'delivery.confirm')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('delivery.confirm' = ANY("permissions"));

UPDATE "User"
SET "permissions" = array_append("permissions", 'labels.manage')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('labels.manage' = ANY("permissions"));
