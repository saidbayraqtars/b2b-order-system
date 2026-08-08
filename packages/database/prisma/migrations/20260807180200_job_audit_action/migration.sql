-- Bakım işi ayarı değişikliği için denetim eylemi.
--
-- Kendi migration'ında: PostgreSQL, bir enum'a eklenen değerin aynı işlem
-- içinde kullanılmasına izin vermiyor.

ALTER TYPE "AuditAction" ADD VALUE 'JOB_SCHEDULE_CHANGED';
