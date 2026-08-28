-- Mutabakat cevabı denetim kaydına giriyor.
--
-- Ayrı göç: uygulanmış bir göçün içeriğini değiştirmek sağlamasını bozuyor.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RECONCILIATION_ANSWERED';
