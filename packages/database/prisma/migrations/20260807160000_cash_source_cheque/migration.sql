-- Tahsil edilen çekin kasaya girişi kendi kaynağını taşır: gün sonu ve kasa
-- raporu "bugün ne girdi" sorusunu kaynağa göre ayırıyor ve çek tahsilatı
-- cariden yapılan tahsilatla aynı satırda görünmemeli — biri bugünkü para,
-- diğeri aylar önce kapanmış bir borcun kâğıdı.
--
-- Tek başına duruyor: PostgreSQL `ALTER TYPE ... ADD VALUE` ifadesini aynı
-- işlem içinde başka ifadelerle çalıştırmıyor, Prisma ise her migration'ı tek
-- işlemde koşturuyor.
ALTER TYPE "CashMovementSource" ADD VALUE 'CHEQUE';
