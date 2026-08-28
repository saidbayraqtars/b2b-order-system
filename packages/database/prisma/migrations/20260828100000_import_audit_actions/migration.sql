-- Toplu içe aktarma denetim eylemleri.
--
-- `ALTER TYPE ... ADD VALUE` PostgreSQL 12+'de işlem içinde çalışıyor ama aynı
-- işlemde *kullanılamıyor*; burada yalnızca ekleniyor, kullanan kod ayrı bir
-- bağlantıdan geliyor. Ekleyen bir göç — hiçbir satır silinmiyor, hiçbir kolon
-- düşmüyor.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRICES_IMPORTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STOCK_IMPORTED';
