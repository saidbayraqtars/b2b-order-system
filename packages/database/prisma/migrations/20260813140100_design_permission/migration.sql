-- Sayfa düzeni izni.
--
-- Kendi migration'ında ve aynı gerekçeyle (bkz. 20260810180100_stock_permissions):
-- kayıt defterine izin eklemek yükselten kurulumda kimsenin satırına yazmaz,
-- kimsede olmayan izin kimseye verilemez, ekran kilitli kalırdı.
--
-- Not: bu bir **rol** değil. Backlog'da "design admin rolü" diye yazılıydı ama
-- rol yalnızca hangi kabuğa girileceğini belirliyor; ne yapılabileceğini izinler
-- belirliyor (Adım 30). Beşinci bir rol, o ayrımı bozardı.

UPDATE "User"
SET "permissions" = array_append("permissions", 'design.manage')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('design.manage' = ANY("permissions"));
