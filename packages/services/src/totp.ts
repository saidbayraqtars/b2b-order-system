import crypto from "node:crypto";

// RFC 6238 (TOTP) / RFC 4226 (HOTP) — authenticator uygulamalarının kullandığı
// algoritma. Google Authenticator, Microsoft Authenticator, Authy, 1Password,
// Bitwarden hepsi aynı varsayılanları kullanır: SHA-1, 6 hane, 30 saniye.
//
// Neden hazır paket yerine elle: algoritma otuz satır ve tam olarak
// belirtilmiş; buradaki her satır okunup doğrulanabilir. Kimlik doğrulamanın
// göbeğine, sürüm yükseltmesiyle davranışı değişebilecek bir bağımlılık
// koymamak bilinçli bir tercih.
//
// SHA-1 seçimi de bilinçli: zayıf olduğu bilinen bir özet, ama TOTP onu HMAC
// içinde kullanır ve HMAC-SHA1 çakışma saldırılarından etkilenmez. Daha
// güçlüsüne geçmek standart dışı kalır — kullanıcının telefonundaki uygulama
// kodu tutturamaz. Uyumluluk burada güvenlikten daha belirleyici.

/** Kod uzunluğu (hane). */
export const TOTP_DIGITS = 6;
/** Bir kodun geçerli olduğu saniye. */
export const TOTP_PERIOD = 30;
/**
 * Kaç adım ileri/geri kabul edilir.
 *
 * 1 = ±30 saniye. Telefon saatinin birkaç saniye kayması yüzünden doğru kodun
 * reddedilmesini engeller. Daha geniş tutmak (±2, ±3) her kodu dakikalarca
 * geçerli kılar ve kaba kuvvetin işini kolaylaştırır.
 */
export const TOTP_WINDOW = 1;

// ─────────────────────────────────────────────
// base32 (RFC 4648, dolgu yok)
// ─────────────────────────────────────────────
//
// Authenticator uygulamaları anahtarı base32 bekler — base64 değil. Elle
// girilebilsin diye büyük harf ve rakam kullanır, `=` dolgusu atılır.

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  // Kullanıcı elle yazdığında boşluk ve küçük harf gelir; dolgu da atılabilir.
  const clean = input.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`base32 dışı karakter: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ─────────────────────────────────────────────
// anahtar ve kod
// ─────────────────────────────────────────────

/**
 * Yeni bir TOTP anahtarı üret (base32 metin).
 *
 * 20 bayt = 160 bit, RFC 4226'nın önerdiği uzunluk ve HMAC-SHA1'in blok
 * boyutuyla uyumlu.
 */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** Verilen zaman adımı için kodu hesapla. */
export function totpCodeForStep(secretBase32: string, step: number): string {
  const key = base32Decode(secretBase32);

  // Sayaç 8 baytlık big-endian. JavaScript'in 32-bit bit işlemleri burada
  // yetmez (2038'den sonra taşar), o yüzden BigInt üzerinden yazılıyor.
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const digest = crypto.createHmac("sha1", key).update(counter).digest();

  // RFC 4226 §5.3 "dynamic truncation": son baytın alt 4 biti bir ofset verir,
  // oradan 4 bayt okunur, en üst bit işaret karışıklığına yol açmasın diye
  // maskelenir.
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** Şu anki zaman adımı. */
export function currentStep(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD);
}

export interface TotpVerifyResult {
  /** Kod hangi adımda tuttu — tekrar kullanımını engellemek için saklanır. */
  step: number;
}

/**
 * Kodu doğrula.
 *
 * `lastUsedStep` verilirse o adım ve öncesi **reddedilir**: aynı kod ikinci kez
 * kullanılamaz. Bu olmadan, kodu bir şekilde ele geçiren biri 30 saniyelik
 * pencere içinde ikinci bir oturum açabilirdi.
 *
 * Karşılaştırma sabit zamanlı: kodun kaçıncı hanesinin tuttuğu yanıt süresinden
 * okunamasın diye.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  options: { now?: Date; window?: number; lastUsedStep?: number | null } = {},
): TotpVerifyResult | null {
  const cleaned = code.replace(/\D/g, "");
  if (cleaned.length !== TOTP_DIGITS) return null;

  const window = options.window ?? TOTP_WINDOW;
  const center = currentStep(options.now);
  const expected = Buffer.from(cleaned, "utf8");

  for (let drift = -window; drift <= window; drift += 1) {
    const step = center + drift;
    if (step < 0) continue;
    // Tekrar koruması: kabul edilmiş bir adım (ve daha eskisi) bir daha geçmez.
    if (options.lastUsedStep != null && step <= options.lastUsedStep) continue;

    const candidate = Buffer.from(totpCodeForStep(secretBase32, step), "utf8");
    if (
      candidate.length === expected.length &&
      crypto.timingSafeEqual(candidate, expected)
    ) {
      return { step };
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// otpauth:// adresi
// ─────────────────────────────────────────────

/**
 * Authenticator uygulamasının okuduğu adres.
 *
 * `issuer` hem yol hem parametre olarak yazılır — eski uygulamalar birini,
 * yenileri ötekini okuyor; ikisini birden vermek her ikisinde de doğru etiketi
 * gösteriyor.
 */
export function otpauthUri(params: {
  secret: string;
  account: string;
  issuer: string;
}): string {
  const label = `${params.issuer}:${params.account}`;
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
}

/** Elle girme kolaylığı: 4'erli gruplar. */
export function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}
