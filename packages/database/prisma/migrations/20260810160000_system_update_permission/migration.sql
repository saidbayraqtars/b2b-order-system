-- Sürüm ekranı izni.
--
-- Kendi migration'ında ve aynı gerekçeyle (bkz. 20260807180100_jobs_permission):
-- kayıt defterine izin eklemek yükselten kurulumda kimsenin satırına yazmaz,
-- kimsede olmayan izin kimseye verilemez, ekran kilitli kalırdı.
--
-- `array_append` + `= ANY` — `dizi || 'metin'` PostgreSQL'de "malformed array
-- literal" veriyor ve koşul sayesinde ikinci çalıştırmada liste ikizlenmiyor.

UPDATE "User"
SET "permissions" = array_append("permissions", 'system.update')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('system.update' = ANY("permissions"));
