import { z } from "zod";

// ─────────────────────────────────────────────
// KAYIT KİMLİĞİ
// ─────────────────────────────────────────────
//
// Bu şema `z.string().cuid()` yerine geçiyor ve sebebi somut bir arıza:
// kataloğun tamamı sipariş edilemiyordu.
//
// `cuid()` yalnızca Prisma'nın `@default(cuid())` ile ürettiği kimlikleri kabul
// eder. Oysa ürün ve varyant satırlarının kimliği her zaman oradan gelmiyor —
// gerçek katalog dışarıdan içe aktarıldığında (2.654 ürün) ve ERP köprüsü
// müşterinin kendi kayıtlarını eşlediğinde kimlik başka bir yerde üretilmiş
// oluyor. Sonuç: `POST /api/cart/items` ve `POST /api/orders` bu satırlar için
// "Invalid cuid" ile 400 dönüyordu; katalogda görünen ama sepete atılamayan
// 2.654 ürün demek bu.
//
// Doğrulamayı gevşetmek bir güvenlik açığı değil, çünkü `cuid()` hiçbir zaman
// yetki kontrolü değildi: kimliğin sahibi olup olmadığımız her zaman veritabanı
// aramasıyla belirleniyor (yoksa 404, başkasınınsa 403). Buradaki kontrolün tek
// işi çöp girdiyi ucuza elemek — biçimini değil, boyutunu ve karakter kümesini
// sınırlamak o işi görüyor.

/**
 * Bir veritabanı satırının kimliği.
 *
 * Karakter kümesi bilerek dar: harf, rakam, `_` ve `-`. Bu küme hem cuid'i hem
 * ERP'den gelen kimliği kapsıyor, ama yol ayracı, boşluk ve tırnak taşıyan bir
 * dizeyi kabul etmiyor — kimliği yola ya da sorguya gömen çağıranlar için
 * ucuz bir sağlamlık.
 */
export const entityIdSchema = z
  .string()
  .trim()
  .min(1, "Kimlik boş olamaz")
  .max(64, "Kimlik çok uzun")
  .regex(/^[A-Za-z0-9_-]+$/, "Geçersiz kimlik");

export type EntityId = z.infer<typeof entityIdSchema>;
