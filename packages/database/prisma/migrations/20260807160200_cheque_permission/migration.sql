-- Yeni izin: çek/senet portföyü yönetimi.
--
-- Kayıt defterine eklemek yetmiyor — mevcut kurulumda kimsenin satırında bu
-- anahtar yok, dolayısıyla ekranı kimse açamaz ve kimse kimseye veremez
-- (kendinde olmayan izin verilemiyor). Her yeni izin, eklendiği sürümde süper
-- adminlere yazılır.
--
-- `array_append`, `||` değil: `dizi || 'metin'` PostgreSQL'de "malformed array
-- literal" veriyor. `= ANY` koşulu sayesinde ikinci çalıştırmada liste
-- ikizlenmez.

UPDATE "User"
SET "permissions" = array_append("permissions", 'cheques.manage')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('cheques.manage' = ANY("permissions"));
