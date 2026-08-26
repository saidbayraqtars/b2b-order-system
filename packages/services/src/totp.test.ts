import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  currentStep,
  formatSecretForDisplay,
  generateTotpSecret,
  otpauthUri,
  TOTP_PERIOD,
  totpCodeForStep,
  verifyTotp,
} from "./totp";

// RFC 6238 Ek B'nin resmî test vektörü. Anahtar ASCII "12345678901234567890",
// base32 karşılığı aşağıdaki dize. Vektörler 8 hane verir; bizim üretimimiz
// 6 hane olduğu için son altı hane karşılaştırılıyor — kesme (truncation)
// aynı sayıdan yapıldığı için bu geçerli bir karşılaştırma.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("base32", () => {
  it("RFC 4648 vektörlerini kodlar", () => {
    expect(base32Encode(Buffer.from("f"))).toBe("MY");
    expect(base32Encode(Buffer.from("fo"))).toBe("MZXQ");
    expect(base32Encode(Buffer.from("foo"))).toBe("MZXW6");
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
  });

  it("kodlama tur döner", () => {
    const buf = Buffer.from("12345678901234567890");
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    expect(base32Encode(base32Decode(RFC_SECRET))).toBe(RFC_SECRET);
  });

  it("elle yazılmış hâli kabul eder — boşluk, küçük harf, dolgu", () => {
    const plain = base32Decode("MZXW6YTBOI");
    expect(base32Decode("mzxw 6ytb oi").equals(plain)).toBe(true);
    expect(base32Decode("MZXW6YTBOI======").equals(plain)).toBe(true);
    expect(base32Decode("MZXW-6YTB-OI").equals(plain)).toBe(true);
  });

  it("alfabe dışı karakteri reddeder", () => {
    // 0/1/8/9 base32 alfabesinde yok; sessizce atlanırsa kullanıcı yanlış
    // anahtarla kurar ve hiçbir kod tutmaz.
    expect(() => base32Decode("MZXW6YTB01")).toThrow(/base32/);
  });
});

describe("totpCodeForStep — RFC 6238 vektörleri", () => {
  const vectors: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];

  for (const [unixSeconds, expected] of vectors) {
    it(`T=${unixSeconds} → ${expected}`, () => {
      const step = Math.floor(unixSeconds / TOTP_PERIOD);
      expect(totpCodeForStep(RFC_SECRET, step)).toBe(expected);
    });
  }

  it("2038'i aşan adımlarda taşmaz", () => {
    // 32-bit yazılsaydı burada sarma olurdu; sayaç BigInt üzerinden yazılıyor.
    expect(totpCodeForStep(RFC_SECRET, Math.floor(20000000000 / 30))).toBe("353130");
  });
});

describe("verifyTotp", () => {
  const now = new Date(1111111109 * 1000);
  const step = currentStep(now);

  it("güncel kodu kabul eder ve adımı döner", () => {
    expect(verifyTotp(RFC_SECRET, "081804", { now })).toEqual({ step });
  });

  it("bir adım geri ve ileriyi kabul eder — telefon saati kayabilir", () => {
    expect(verifyTotp(RFC_SECRET, totpCodeForStep(RFC_SECRET, step - 1), { now }))
      .toEqual({ step: step - 1 });
    expect(verifyTotp(RFC_SECRET, totpCodeForStep(RFC_SECRET, step + 1), { now }))
      .toEqual({ step: step + 1 });
  });

  it("iki adım ötesini reddeder", () => {
    expect(verifyTotp(RFC_SECRET, totpCodeForStep(RFC_SECRET, step + 2), { now }))
      .toBeNull();
  });

  it("kullanılmış adımı bir daha kabul etmez", () => {
    expect(verifyTotp(RFC_SECRET, "081804", { now, lastUsedStep: step })).toBeNull();
  });

  it("kullanılmış adımdan eskisini de reddeder", () => {
    // Sadece eşitlik aransaydı, saldırgan bir önceki pencerenin kodunu
    // kabul ettirebilirdi.
    const older = totpCodeForStep(RFC_SECRET, step - 1);
    expect(verifyTotp(RFC_SECRET, older, { now, lastUsedStep: step })).toBeNull();
  });

  it("kullanılmış adımdan sonrakini kabul eder", () => {
    const next = totpCodeForStep(RFC_SECRET, step + 1);
    expect(verifyTotp(RFC_SECRET, next, { now, lastUsedStep: step })).toEqual({
      step: step + 1,
    });
  });

  it("boşluklu girişi temizler", () => {
    expect(verifyTotp(RFC_SECRET, "081 804", { now })).toEqual({ step });
  });

  it("yanlış uzunluğu ve boş girdiyi reddeder", () => {
    expect(verifyTotp(RFC_SECRET, "", { now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, "0818", { now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, "08180400", { now })).toBeNull();
  });

  it("yanlış kodu reddeder", () => {
    expect(verifyTotp(RFC_SECRET, "000000", { now })).toBeNull();
  });
});

describe("anahtar üretimi", () => {
  it("160 bit base32 üretir ve her çağrıda farklıdır", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).toHaveLength(32);
    expect(base32Decode(a)).toHaveLength(20);
    expect(a).not.toBe(b);
  });

  it("üretilen anahtarla kendi kodu tutar", () => {
    const secret = generateTotpSecret();
    const code = totpCodeForStep(secret, currentStep());
    expect(verifyTotp(secret, code)).not.toBeNull();
  });
});

describe("otpauth adresi", () => {
  it("authenticator uygulamasının beklediği alanları taşır", () => {
    const uri = otpauthUri({
      secret: RFC_SECRET,
      account: "patron@ornek.com",
      issuer: "b2b",
    });
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    // Etiket hem issuer hem hesabı taşır; ":" kodlanmış olmalı yoksa bazı
    // uygulamalar adresi yolun ortasından keser.
    expect(uri).toContain("b2b%3Apatron%40ornek.com");

    const query = new URLSearchParams(uri.slice(uri.indexOf("?") + 1));
    expect(query.get("secret")).toBe(RFC_SECRET);
    expect(query.get("issuer")).toBe("b2b");
    expect(query.get("algorithm")).toBe("SHA1");
    expect(query.get("digits")).toBe("6");
    expect(query.get("period")).toBe("30");
  });
});

describe("formatSecretForDisplay", () => {
  it("elle girilebilsin diye dörderli gruplar", () => {
    expect(formatSecretForDisplay("ABCDEFGHIJKL")).toBe("ABCD EFGH IJKL");
  });

  it("sonda boşluk bırakmaz", () => {
    expect(formatSecretForDisplay("ABCDEF")).toBe("ABCD EF");
  });
});
