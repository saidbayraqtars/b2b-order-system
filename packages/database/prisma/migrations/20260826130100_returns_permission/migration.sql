-- İade kararı izni.
--
-- Ayrı bir göç, tabloları açan 20260826130000_returns_rma'nın içinde değil:
-- o göç zaten uygulanmış kurulumlar var ve uygulanmış bir göçün içeriğini
-- değiştirmek sağlamasını bozar (Prisma "migration modified after applied"
-- der ve dağıtım durur).
--
-- Gerekçe her izin göçüyle aynı (bkz. 20260810160000_system_update_permission):
-- kayıt defterine izin eklemek, yükselten kurulumda kimsenin satırına yazmaz.
-- Kimsede olmayan izin kimseye verilemediği için (kendinde olmayanı veremezsin
-- kuralı) iade ekranı o kurulumda herkese kapalı kalırdı.
UPDATE "User"
SET "permissions" = array_append("permissions", 'returns.manage')
WHERE "role" = 'SUPER_ADMIN' AND NOT ('returns.manage' = ANY("permissions"));
