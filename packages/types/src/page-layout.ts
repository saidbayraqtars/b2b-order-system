import { z } from "zod";

// Sayfa düzeni: vitrinin hangi bloklardan oluştuğu ve sırası.
//
// Buradakiler yalnızca **biçim**. Hangi blok tipinin var olduğu, hangi
// parametreleri aldığı ve kaldırılıp kaldırılamayacağı sunucudaki kayıt
// defterinde (`@repo/services`) duruyor — güvenlik sınırı orası. Bu dosya
// istemcinin gönderdiği gövdenin şeklini kontrol eder, anlamını değil.

export const PageKeyEnum = z.enum(["PORTAL_HOME"]);
export type PageKey = z.infer<typeof PageKeyEnum>;

export const PAGE_KEY_LABELS: Record<PageKey, string> = {
  PORTAL_HOME: "Vitrin ana sayfası",
};

/**
 * Blok tipi burada **serbest metin**, `z.enum` değil.
 *
 * Sebebi: tip listesinin tek sahibi sunucudaki kayıt defteri. Burada ikinci bir
 * liste tutmak, yeni blok eklendiğinde iki yerde birden güncelleme gerektirirdi
 * ve biri unutulduğunda hata "bilinmeyen blok" değil, sessiz bir doğrulama
 * reddi olurdu. Bilinmeyen tip sunucuda reddediliyor; kaydedilmiş ama artık
 * tanınmayan tip ise çizilmiyor.
 */
export const pageBlockSchema = z.object({
  type: z.string().trim().min(1).max(40),
  /** Bloğa özel ayarlar; şeması kayıt defterinde. */
  params: z.record(z.unknown()).default({}),
  /**
   * Kapalı blok listede durur ama çizilmez. Silmek yerine kapatmak, ayarlarını
   * kaybetmeden geri açabilmek demek — "kampanya bandını bu hafta kaldır"
   * isteğinin doğru karşılığı bu.
   */
  enabled: z.boolean().default(true),
});
export type PageBlockInput = z.infer<typeof pageBlockSchema>;

export const pageLayoutSchema = z.object({
  blocks: z.array(pageBlockSchema).max(40),
});
export type PageLayoutInput = z.infer<typeof pageLayoutSchema>;
