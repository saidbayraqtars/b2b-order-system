// Testlerin veritabanı adresi.
//
// Dosyanın tek işi `DATABASE_URL`i **ayrı bir Postgres şemasına** çevirmek.
// Prisma istemcisini içe aktarmıyor: `src/index.ts` içe aktarıldığı anda
// bağlantıyı kuruyor ve bu modül tam olarak ondan *önce* çalışmak zorunda.
//
// Neden ayrı şema:
//
// Rota testleri gerçek veritabanına yazıyor ve `teardown()` ne kadar dikkatli
// olursa olsun yarıda kesilen bir koşu temizlik yapamıyor. 2026-08-27'de
// gösterim veritabanında sayıldı: 23 `@test.local` kullanıcısı, 4 uydurma
// kategori, 2 uydurma firma. İkisi de zarar: kullanıcı ekranının görüntüsünde
// "plasiyer-acctmtbh3rwy588@test.local" satırları vardı ve o görüntü müşteriye
// gösterilemez; `db:seed-demo` sonrası kurulum kirli açılıyordu.
//
// Temizliği sıkılaştırmak bu sorunu **çözmüyor**, erteliyor: Ctrl+C'yle
// kesilen bir koşu her zaman artık bırakır. Ayrı şema bırakılan artığın
// gösterim verisine hiç değmemesini sağlıyor — artık kalsa bile kimse görmüyor,
// ve `db:test-prepare` şemayı istendiği an sıfırlıyor.

/** Şema adı; `TEST_SCHEMA` ile değiştirilebilir. */
export const TEST_SCHEMA = process.env.TEST_SCHEMA?.trim() || "test";

/**
 * Verilen bağlantı adresini test şemasına çevirir.
 *
 * `TEST_DATABASE_URL` verilmişse o kazanıyor — ayrı bir veritabanı (aynı
 * sunucuda ya da başka bir sunucuda) kullanmak isteyen kurulumlar için kaçış
 * kapısı. Adres yoksa `undefined` dönüyor ve testler veritabanı gerektiren
 * bölümleri atlıyor (`hasDb`).
 */
export function testDatabaseUrl(
  raw: string | undefined = process.env.DATABASE_URL,
): string | undefined {
  const override = process.env.TEST_DATABASE_URL?.trim();
  if (override) return override;
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    url.searchParams.set("schema", TEST_SCHEMA);
    return url.toString();
  } catch {
    // Ayrıştırılamayan bir adresi tahmin ederek düzeltmek, testleri sessizce
    // yanlış veritabanına bağlamaktan daha iyi değil.
    return raw;
  }
}

/**
 * `process.env.DATABASE_URL`i test şemasına çevirir.
 *
 * İki vitest kurulum dosyasından da çağrılıyor ve **Prisma içe aktarılmadan
 * önce** çağrılmak zorunda: istemci adresi kurulum anında okuyor.
 */
export function applyTestSchema(): void {
  const next = testDatabaseUrl();
  if (next) process.env.DATABASE_URL = next;
}
