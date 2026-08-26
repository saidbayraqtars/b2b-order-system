import crypto from "node:crypto";

// Sunucu tarafında saklanan sırların şifrelenmesi (AES-256-GCM).
//
// Neden var: TOTP anahtarı düz metin saklanırsa, veritabanını okuyabilen biri
// her kullanıcı için geçerli kod üretebilir. O durumda ikinci adım hiçbir şey
// korumaz — çünkü saldırganın elinde zaten şifre özetleri de vardır.
//
// Anahtar **veritabanında değil ortamda** durur. İkisi aynı yerde olsaydı
// şifreleme yalnızca bir kodlama katmanı olurdu; ayrı olduğu için tek başına
// bir veritabanı yedeği sırları açmaya yetmez.
//
// Biçim:  v1.<iv-b64url>.<tag-b64url>.<ciphertext-b64url>
// Sürüm öneki bilerek var: anahtar döndürmek ya da algoritma değiştirmek
// gerektiğinde eski kayıtlar okunmaya devam edebilsin.

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM'in önerdiği uzunluk
const KEY_BYTES = 32;

export const SECRET_KEY_ENV = "TOTP_ENCRYPTION_KEY";

export class SecretBoxError extends Error {
  constructor(
    message: string,
    readonly code: "ANAHTAR_YOK" | "ANAHTAR_GECERSIZ" | "COZULEMEDI",
  ) {
    super(message);
    this.name = "SecretBoxError";
  }
}

/**
 * Ortam değişkeninden anahtarı oku.
 *
 * Anahtar yoksa **hata fırlatır, sessizce düz metne düşmez.** Düşseydi, ortam
 * değişkenini kurmayı unutan bir kurulum çalışmaya devam eder ve kimse fark
 * etmeden bütün TOTP anahtarları açıkta saklanırdı. Gürültülü başarısızlık
 * burada doğru olan.
 */
function readKey(): Buffer {
  const raw = process.env[SECRET_KEY_ENV];
  if (!raw || !raw.trim()) {
    throw new SecretBoxError(
      `${SECRET_KEY_ENV} tanımlı değil. İki adımlı doğrulama bu anahtar olmadan ` +
        `çalışamaz: 32 baytlık rastgele bir değeri base64 olarak verin ` +
        `(örn. "openssl rand -base64 32").`,
      "ANAHTAR_YOK",
    );
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw.trim(), "base64");
  } catch {
    throw new SecretBoxError(
      `${SECRET_KEY_ENV} base64 olarak çözülemedi.`,
      "ANAHTAR_GECERSIZ",
    );
  }
  if (key.length !== KEY_BYTES) {
    throw new SecretBoxError(
      `${SECRET_KEY_ENV} ${KEY_BYTES} bayt olmalı, ${key.length} bayt çözüldü.`,
      "ANAHTAR_GECERSIZ",
    );
  }
  return key;
}

/** Anahtar kurulu mu — kurulum ekranı bunu kullanıcıya söyleyebilsin diye. */
export function secretBoxReady(): boolean {
  try {
    readKey();
    return true;
  } catch {
    return false;
  }
}

/** Düz metni şifrele. Aynı girdi her çağrıda farklı çıktı verir (rastgele IV). */
export function sealSecret(plaintext: string): string {
  const key = readKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Şifreli metni çöz.
 *
 * GCM kimlik doğrulama etiketi kurcalanmış kaydı yakalar: birisi veritabanında
 * `totpSecret` değerini kendi anahtarıyla değiştirmeye kalkarsa çözme başarısız
 * olur, sessizce yanlış bir sırla devam edilmez.
 */
export function openSecret(sealed: string): string {
  const key = readKey();
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new SecretBoxError(
      "Şifreli değer tanınmayan biçimde.",
      "COZULEMEDI",
    );
  }
  const [, ivPart, tagPart, dataPart] = parts;
  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(ivPart!, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart!, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart!, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Sebebi dışarı sızdırmıyoruz: yanlış anahtar ile kurcalanmış veriyi
    // ayırt etmek saldırgana bilgi verir, çağırana bir fayda sağlamaz.
    throw new SecretBoxError(
      "Şifreli değer çözülemedi — anahtar değişmiş ya da kayıt bozulmuş olabilir.",
      "COZULEMEDI",
    );
  }
}
