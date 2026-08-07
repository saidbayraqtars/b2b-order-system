-- Kurye rolü.
--
-- Kendi migration'ında duruyor: PostgreSQL, bir enum'a eklenen değerin aynı
-- işlem içinde kullanılmasına izin vermiyor. Aynı dosyada hem ADD VALUE hem de
-- 'COURIER' yazan bir sorgu olsaydı migration çalışmazdı.

ALTER TYPE "Role" ADD VALUE 'COURIER';
