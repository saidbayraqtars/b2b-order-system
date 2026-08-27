-- Bayi başvurusu karar izni.
--
-- Ayrı bir göç, tabloyu açan 20260827090000_dealer_application'ın içinde değil:
-- uygulanmış bir göçün içeriğini değiştirmek sağlamasını bozar (Prisma
-- "migration modified after applied" der ve dağıtım durur). Aynı gerekçe
-- 20260826130100_returns_permission'da da yazılı.
--
-- Kayıt defterine izin eklemek, yükselten kurulumda kimsenin satırına yazmaz.
-- Kimsede olmayan izin kimseye verilemediği için (kendinde olmayanı veremezsin
-- kuralı) başvuru ekranı o kurulumda herkese kapalı kalırdı.
UPDATE "User"
SET "permissions" = array_append("permissions", 'applications.manage')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('applications.manage' = ANY("permissions"));
