/**
 * Süreç açılışında bir kez çalışır (Next `instrumentationHook`).
 *
 * Buranın tek işi yapılandırmayı doğrulamak. Eksikse süreç **burada** ölmeli:
 * kapsayıcı yeniden başlatma döngüsüne girer, sağlık kontrolü kırmızı kalır ve
 * güncelleme betiği geri alır. Alternatif, sistemin ayakta görünüp ilk gerçek
 * müşteri isteğinde patlamasıydı.
 */
export async function register(): Promise<void> {
  // Edge çalışma zamanında da tetikleniyor; ortam denetimi Node tarafının işi.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next build` de bu kancayı çalıştırıyor. Derleme anında veritabanı adresi
  // ya da kiracı klasörü **olmaması normal** — imaj bir müşteriye özel değil,
  // bunlar çalıştırma anında veriliyor. Derlemeyi yapılandırma yüzünden
  // düşürmek, imajın hiç üretilememesi demek olurdu.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Alt yoldan içe aktarılıyor, `@repo/services` çatısından değil: bu kanca
  // Next tarafından **hem** Node hem edge çalışma zamanı için derleniyor ve
  // çatı dosyası nodemailer'a kadar her şeyi çekiyor. Edge paketi onu çözemiyor
  // ve derleme düşüyor. Denetim birkaç saf fonksiyondan ibaret; yalnızca onlar
  // alınıyor.
  const { assertRuntimeEnv } = await import("@repo/services/runtime-env");
  try {
    assertRuntimeEnv();
  } catch (e) {
    // Fırlatmak yetmiyor: Next bu kancadaki hatayı yakalayıp "Failed to prepare
    // server" yazıyor ve **süreci ayakta tutuyor**. Sonuç, `docker ps` çıktısında
    // "Up" görünen ama hiçbir isteğe cevap vermeyen bir kapsayıcı — operatörün
    // karşılaşabileceği en kötü durum. Açıkça düşürülüyor: yeniden başlatma
    // ilkesi devreye girer, günlükte sebep tek satır hâlinde durur.
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  // Zamanlayıcı burada başlıyor, bir istek kancasında değil: ilk istek gelene
  // kadar hiçbir bakım işinin çalışmaması, kimsenin girmediği bir hafta sonu
  // boyunca sistemin kendini hiç toplamaması demekti.
  //
  // Ayrıca içe aktarma **başlatmadan sonra**: `assertRuntimeEnv` düşerse
  // veritabanına bağlanmayı hiç denememeliyiz, yoksa günlükte asıl sebebin
  // üstüne bir de bağlantı hatası biniyor.
  const { startScheduler } = await import("@repo/services/scheduler");
  startScheduler();
}
