import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Cihaz ayarları — sunucu adresi ve güncelleme tercihi.
//
// **Sunucu adresi bir cihaz ayarı, uygulamanın parçası değil** (mobilde de
// aynı karar, bkz. Adım 48). Her müşteri kendi sunucusunda çalışıyor; adresi
// paketin içine gömmek, her müşteri için ayrı bir kurulum dosyası derlemek
// demekti. Aynı `.exe` her kuruluma gidiyor, ilk açılışta adresi soruyor.
//
// Dosya `userData` altında: Windows'ta `%APPDATA%/B2B/ayarlar.json`. Program
// klasörüne yazılsaydı standart kullanıcı yazamazdı ve güncelleme dosyayı
// silerdi.

export interface Ayarlar {
  /** `https://siparis.musteri.com` — sonda eğik çizgi yok. */
  sunucu: string;
  /** Kapanışta güncellemeyi kendiliğinden kur. */
  otomatikGuncelle: boolean;
  /**
   * Sunucunun önünde bir parola kapısı varsa (sunum tüneli gibi) onun
   * kimliği. Boşsa kapı yok demektir.
   *
   * Neden gerekiyor: tarayıcı 401 görünce kullanıcıya kutu açıyor, Electron
   * açmıyor — istek sessizce düşüyor ve uygulama "bağlanılamadı" diyor.
   * İlk denemede tam olarak bu oldu: kapının arkasındaki sunucuya uygulamadan
   * **tek istek** ulaşmadı.
   */
  kullanici: string;
  parola: string;
}

const VARSAYILAN: Ayarlar = {
  sunucu: "",
  otomatikGuncelle: true,
  kullanici: "",
  parola: "",
};

function dosya(): string {
  return join(app.getPath("userData"), "ayarlar.json");
}

export function ayarlariOku(): Ayarlar {
  try {
    const ham = readFileSync(dosya(), "utf8");
    const veri = JSON.parse(ham) as Partial<Ayarlar>;
    return {
      sunucu: normalizeAdres(typeof veri.sunucu === "string" ? veri.sunucu : ""),
      otomatikGuncelle: veri.otomatikGuncelle !== false,
      kullanici: typeof veri.kullanici === "string" ? veri.kullanici : "",
      parola: typeof veri.parola === "string" ? veri.parola : "",
    };
  } catch {
    // Dosya yok ya da bozuk: ikisinin de cevabı aynı — kurulum ekranı açılır.
    return { ...VARSAYILAN };
  }
}

export function ayarlariYaz(ayar: Ayarlar): void {
  const yol = dosya();
  mkdirSync(dirname(yol), { recursive: true });
  // Önce geçici ada, sonra taşıma: yarım yazılmış bir ayar dosyası
  // uygulamanın bir daha hiç açılmaması demek.
  const gecici = `${yol}.tmp`;
  writeFileSync(gecici, JSON.stringify(ayar, null, 2), "utf8");
  if (existsSync(yol)) {
    try {
      renameSync(gecici, yol);
      return;
    } catch {
      writeFileSync(yol, JSON.stringify(ayar, null, 2), "utf8");
      return;
    }
  }
  renameSync(gecici, yol);
}

/**
 * Kullanıcının yazdığı adresi kullanılabilir hâle getirir.
 *
 * Beklenen giriş "siparis.musteri.com" ya da "192.168.1.6:3000" — kimse şema
 * yazmıyor. Şema yoksa `https` varsayılıyor, ama yerel ağ adresleri
 * (`localhost`, `192.168.*`, `10.*`) `http` alıyor: kurulumun içindeki
 * sunucuda TLS yok ve "https://192.168.1.6:3000" hiçbir zaman açılmaz.
 */
export function normalizeAdres(ham: string): string {
  const metin = ham.trim().replace(/\/+$/, "");
  if (!metin) return "";
  if (/^https?:\/\//i.test(metin)) return metin;

  const yerel =
    /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(metin);
  return `${yerel ? "http" : "https"}://${metin}`;
}

/**
 * Kapı kimliği varsa `Basic ...` başlığı, yoksa `null`.
 *
 * Tek yerde üretiliyor çünkü üç yer kullanıyor: adres denemesi, güncelleyici ve
 * pencerenin kimlik doğrulama olayı. Üçünden biri unutulursa hata "çalışıyor
 * ama güncellenmiyor" gibi geç fark edilen bir biçimde çıkıyor.
 */
export function temelYetki(ayar: Pick<Ayarlar, "kullanici" | "parola">): string | null {
  if (!ayar.kullanici && !ayar.parola) return null;
  const ham = `${ayar.kullanici}:${ayar.parola}`;
  return `Basic ${Buffer.from(ham, "utf8").toString("base64")}`;
}
