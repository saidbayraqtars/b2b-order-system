import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  openSecret,
  sealSecret,
  SecretBoxError,
  SECRET_KEY_ENV,
  secretBoxReady,
} from "./secret-box";

const KEY = crypto.randomBytes(32).toString("base64");
const OTHER_KEY = crypto.randomBytes(32).toString("base64");

let saved: string | undefined;

beforeEach(() => {
  saved = process.env[SECRET_KEY_ENV];
  process.env[SECRET_KEY_ENV] = KEY;
});

afterEach(() => {
  if (saved === undefined) delete process.env[SECRET_KEY_ENV];
  else process.env[SECRET_KEY_ENV] = saved;
});

describe("sealSecret / openSecret", () => {
  it("tur döner", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(openSecret(sealSecret(secret))).toBe(secret);
  });

  it("Türkçe ve çok baytlı metni bozmaz", () => {
    const text = "şÇğüöİ — 🔐";
    expect(openSecret(sealSecret(text))).toBe(text);
  });

  it("aynı girdi her çağrıda farklı şifreli metin verir", () => {
    // Sabit IV olsaydı, iki kullanıcının aynı anahtarı taşıdığı veritabanından
    // okunabilirdi. Rastgele IV bunu engeller.
    expect(sealSecret("aynı")).not.toBe(sealSecret("aynı"));
  });

  it("sürüm öneki taşır", () => {
    const sealed = sealSecret("x");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed.split(".")).toHaveLength(4);
  });
});

describe("kurcalama", () => {
  it("şifreli metin değişirse çözmez", () => {
    const sealed = sealSecret("gizli");
    const parts = sealed.split(".");
    // Son baytı çevir: GCM etiketi tutmaz.
    const data = Buffer.from(parts[3]!, "base64url");
    data[data.length - 1] = data[data.length - 1]! ^ 0xff;
    parts[3] = data.toString("base64url");
    expect(() => openSecret(parts.join("."))).toThrow(SecretBoxError);
  });

  it("başka anahtarla şifrelenmişi çözmez", () => {
    const sealed = sealSecret("gizli");
    process.env[SECRET_KEY_ENV] = OTHER_KEY;
    expect(() => openSecret(sealed)).toThrow(/çözülemedi/);
  });

  it("tanınmayan biçimi reddeder", () => {
    expect(() => openSecret("düz metin")).toThrow(/tanınmayan biçimde/);
    expect(() => openSecret("v2.a.b.c")).toThrow(/tanınmayan biçimde/);
  });

  it("çözme hatasının sebebini dışarı vermez", () => {
    // Yanlış anahtar mı, kurcalanmış kayıt mı — ayrımı saldırgana bilgi verir.
    process.env[SECRET_KEY_ENV] = OTHER_KEY;
    const sealed = sealSecret("gizli");
    process.env[SECRET_KEY_ENV] = KEY;
    try {
      openSecret(sealed);
      expect.unreachable("çözülmemeliydi");
    } catch (e) {
      expect((e as SecretBoxError).code).toBe("COZULEMEDI");
    }
  });
});

describe("anahtar denetimi", () => {
  it("anahtar yoksa sessizce düz metne düşmez", () => {
    delete process.env[SECRET_KEY_ENV];
    expect(() => sealSecret("x")).toThrow(SecretBoxError);
    expect(secretBoxReady()).toBe(false);
    try {
      sealSecret("x");
    } catch (e) {
      expect((e as SecretBoxError).code).toBe("ANAHTAR_YOK");
    }
  });

  it("boş anahtarı yok sayar", () => {
    process.env[SECRET_KEY_ENV] = "   ";
    expect(secretBoxReady()).toBe(false);
  });

  it("yanlış uzunluktaki anahtarı reddeder", () => {
    process.env[SECRET_KEY_ENV] = crypto.randomBytes(16).toString("base64");
    expect(secretBoxReady()).toBe(false);
    try {
      sealSecret("x");
    } catch (e) {
      expect((e as SecretBoxError).code).toBe("ANAHTAR_GECERSIZ");
      expect((e as Error).message).toContain("32 bayt olmalı");
    }
  });

  it("anahtar kuruluyken hazır der", () => {
    expect(secretBoxReady()).toBe(true);
  });
});
