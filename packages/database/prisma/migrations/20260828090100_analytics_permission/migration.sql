-- Yönetici panosu izni.
--
-- Ayrı göç, tabloyu açanın içinde değil: uygulanmış bir göçün içeriğini
-- değiştirmek sağlamasını bozuyor (bkz. 20260827090100_applications_permission).
--
-- Kayıt defterine izin eklemek yükselten kurulumda kimsenin satırına yazmıyor;
-- kimsede olmayan izin kimseye verilemediği için pano o kurulumda herkese
-- kapalı kalırdı.
UPDATE "User"
SET "permissions" = array_append("permissions", 'analytics.view')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('analytics.view' = ANY("permissions"));
