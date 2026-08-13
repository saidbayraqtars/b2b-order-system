-- Stok defteri izinleri.
--
-- Kendi migration'ında ve aynı gerekçeyle (bkz. 20260810160000_system_update_permission):
-- kayıt defterine izin eklemek yükselten kurulumda kimsenin satırına yazmaz,
-- kimsede olmayan izin kimseye verilemez, ekran kilitli kalırdı.
--
-- `array_append` + `= ANY` — `dizi || 'metin'` PostgreSQL'de "malformed array
-- literal" veriyor ve koşul sayesinde ikinci çalıştırmada liste ikizlenmiyor.

UPDATE "User"
SET "permissions" = array_append("permissions", 'stock.view')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('stock.view' = ANY("permissions"));

UPDATE "User"
SET "permissions" = array_append("permissions", 'stock.manage')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('stock.manage' = ANY("permissions"));
