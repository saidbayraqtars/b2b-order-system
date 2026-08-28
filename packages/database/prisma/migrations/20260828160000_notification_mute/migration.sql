-- Bildirim tercihi: kullanıcının **istemediği** olaylar.
--
-- Yalnızca ekliyor. Ters kodlanmadı (istediklerinin listesi): öyle olsaydı yeni
-- bir olay eklendiğinde kimse onu almazdı ve sessizce kaybolan bir bildirim,
-- gürültülü olandan kötüdür.
ALTER TABLE "User" ADD COLUMN "mutedNotifications" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "User" SET "mutedNotifications" = ARRAY[]::TEXT[] WHERE "mutedNotifications" IS NULL;
ALTER TABLE "User" ALTER COLUMN "mutedNotifications" SET NOT NULL;
