/**
 * Açılışta ortam değişkeni denetimi.
 *
 * Bir kurulum müşterinin kendi sunucusunda çalışıyor ve oraya bakan bir
 * geliştirici yok. Eksik ya da yanlış bir değişken, üretimde iki türlü ceza
 * kesiyor: ya sessizce yanlış davranış (e-posta bağlantısı localhost'a çıkar,
 * yüklenen görsel kapsayıcıyla birlikte silinir), ya da ilk gerçek istekte
 * patlama. İkisi de kabul edilemez — süreç **açılışta** durmalı ve nedenini
 * söylemeli.
 *
 * Kural: geliştirmede yol vermek serbest, üretimde değil. `NODE_ENV=production`
 * altında eksik olan her şey ölümcül; geliştirmede yalnızca uyarı.
 */

/** Yerelde imza anahtarı yokken kullanılan sabit — üretimde YASAK. */
export const DEV_FALLBACK_SECRET = "dev-insecure-secret-change-me";

export class EnvError extends Error {
  constructor(public readonly problems: readonly string[]) {
    super(
      `Kurulum yapılandırması eksik:\n  - ${problems.join("\n  - ")}\n` +
        `Bkz. .env.production.example ve DEPLOYMENT.md.`,
    );
    this.name = "EnvError";
  }
}

function value(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Üretimde bulunması **zorunlu** olanlar ve neden.
 *
 * `UPLOAD_DIR` listede çünkü varsayılanı `process.cwd()/uploads`: kapsayıcı
 * içinde bu, imaj her güncellendiğinde silinen bir dizin demek. Yüklenen ürün
 * görselleri sessizce kaybolur. Kalıcı bir birim (volume) yolu verilmesi şart.
 *
 * `APP_URL` listede çünkü şifre sıfırlama bağlantısı buradan üretiliyor;
 * varsayılanı localhost ve müşteriye giden e-postada localhost bağlantısı
 * "sistem çalışmıyor" demenin uzun yolu.
 */
const REQUIRED_IN_PRODUCTION: ReadonlyArray<{ name: string; why: string }> = [
  { name: "DATABASE_URL", why: "veritabanı bağlantısı" },
  { name: "AUTH_SECRET", why: "oturum ve mobil jeton imzası" },
  { name: "TENANT_DIR", why: "bu kurulumun hangi firmaya ait olduğu" },
  { name: "APP_URL", why: "e-postadaki bağlantıların adresi" },
  { name: "UPLOAD_DIR", why: "yüklenen görsellerin kalıcı dizini" },
];

/**
 * Sorunları döndürür (fırlatmaz) — sağlık ucu da aynı listeyi kullanıyor.
 * Üretim dışında liste her zaman boş: yerelde yarım yapılandırmayla çalışmak
 * normal.
 */
export function envProblems(): string[] {
  if (process.env.NODE_ENV !== "production") return [];

  const problems: string[] = [];

  for (const { name, why } of REQUIRED_IN_PRODUCTION) {
    if (value(name) === "") problems.push(`${name} tanımlı değil (${why}).`);
  }

  const secret = value("AUTH_SECRET");
  if (secret === DEV_FALLBACK_SECRET) {
    problems.push(
      "AUTH_SECRET geliştirme sabitine eşit — bu değeri bilen herkes kendine " +
        "istediği rolde jeton üretebilir. Yeni bir değer üretin: openssl rand -base64 33",
    );
  } else if (secret !== "" && secret.length < 32) {
    problems.push("AUTH_SECRET 32 karakterden kısa; kaba kuvvetle denenebilir.");
  }

  const appUrl = value("APP_URL");
  if (appUrl !== "" && /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(appUrl)) {
    problems.push(
      `APP_URL yerel adrese bakıyor (${appUrl}); e-postadaki bağlantılar müşteride açılmaz.`,
    );
  }

  return problems;
}

/**
 * Ölümcül olmayan ama söylenmesi gereken şeyler. Açılış günlüğüne yazılır,
 * süreci durdurmaz — SMTP'siz bir kurulum çalışır durumdadır, yalnızca
 * e-postalar günlüğe basılır ve operatörün bunu bilmesi gerekir.
 */
export function envWarnings(): string[] {
  if (process.env.NODE_ENV !== "production") return [];

  const warnings: string[] = [];
  if (value("SMTP_HOST") === "") {
    warnings.push(
      "SMTP_HOST boş: e-posta gönderilmiyor, sunucu günlüğüne yazılıyor. " +
        "Şifre sıfırlama ve sipariş bildirimleri müşteriye ulaşmaz.",
    );
  }
  if (value("APP_URL").startsWith("http://")) {
    warnings.push(
      "APP_URL http:// ile başlıyor: oturum çerezi ve şifre sıfırlama " +
        "bağlantısı şifresiz taşınır. Üretimde https kullanın.",
    );
  }
  return warnings;
}

/** Açılışta çağrılır; üretimde eksik yapılandırma varsa süreci durdurur. */
export function assertRuntimeEnv(): void {
  for (const warning of envWarnings()) {
    console.warn(`[env] uyarı: ${warning}`);
  }
  const problems = envProblems();
  if (problems.length > 0) throw new EnvError(problems);
}
