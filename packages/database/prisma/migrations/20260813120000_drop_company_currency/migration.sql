-- Firma para birimi kolonunu kaldır.
--
-- Kolon hiçbir hesapta okunmuyordu (defter TL) ama cari ekstre belgesi onu
-- basıyordu: "USD" işaretlenmiş bir firmanın TL bakiyesi dolar diye çıkıyordu.
-- Yabancı para liste fiyatının özelliği; sipariş anında TL'ye çevrilir ve
-- kullanılan kur OrderItem.exchangeRate'e donar.
--
-- Veri kaybı: kolonda tutulan üç harfli kodlar. Hiçbir yerde girdi olarak
-- kullanılmadığı için türetilecek bir şey yok.
ALTER TABLE "Company" DROP COLUMN "currency";
