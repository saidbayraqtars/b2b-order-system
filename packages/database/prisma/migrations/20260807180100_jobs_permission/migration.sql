-- Zamanlanmış iş yönetimi izni.
--
-- Kendi migration'ında: kayıt defterine izin eklemek yükselten kurulumda
-- kimsenin satırına yazmıyor, dolayısıyla ekranı kimse açamaz ve kimse kimseye
-- veremez (kendinde olmayan izin verilemiyor). Kurulumun sahibi her zaman
-- dağıtabilecek durumda kalmalı.
--
-- `array_append` kullanılıyor, `||` değil: `dizi || 'metin'` PostgreSQL'de
-- metni dizi literali sanıp "malformed array literal" ile patlıyor.
-- Koşuldaki `= ANY` sayesinde migration ikinci kez çalışsa da liste ikizlenmez.

UPDATE "User"
SET "permissions" = array_append("permissions", 'jobs.manage')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('jobs.manage' = ANY("permissions"));
