-- Sipariş kabul kuralları izni.
--
-- Ayrı göç, tabloyu açanın içinde değil: uygulanmış bir göçün içeriğini
-- değiştirmek sağlamasını bozuyor.
--
-- Kayıt defterine izin eklemek yükselten kurulumda kimsenin satırına yazmıyor;
-- kimsede olmayan izin kimseye verilemediği için ekran o kurulumda herkese
-- kapalı kalırdı.
UPDATE "User"
SET "permissions" = array_append("permissions", 'order_policy.manage')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('order_policy.manage' = ANY("permissions"));
