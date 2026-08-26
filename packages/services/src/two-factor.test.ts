import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SECRET_KEY_ENV, sealSecret } from "./secret-box";
import { currentStep, generateTotpSecret, totpCodeForStep } from "./totp";
import {
  requiresTwoFactor,
  twoFactorRequirementReason,
  verifySecondFactor,
  TWO_FACTOR_REQUIRED_PERMISSIONS,
  TWO_FACTOR_REQUIRED_ROLES,
} from "./two-factor";

// Veritabanına dokunmayan kısım: politika (kim zorunlu) ve kod doğrulama.
// `verifySecondFactor` yalnızca `userId` verildiğinde yazma yapıyor; buradaki
// çağrılar onu vermiyor, dolayısıyla Postgres gerekmiyor.

let saved: string | undefined;

beforeEach(() => {
  saved = process.env[SECRET_KEY_ENV];
  process.env[SECRET_KEY_ENV] = crypto.randomBytes(32).toString("base64");
});

afterEach(() => {
  if (saved === undefined) delete process.env[SECRET_KEY_ENV];
  else process.env[SECRET_KEY_ENV] = saved;
});

describe("requiresTwoFactor", () => {
  it("yönetici rolleri yetkisiz de olsa zorunlu", () => {
    for (const role of TWO_FACTOR_REQUIRED_ROLES) {
      expect(requiresTwoFactor({ role, permissions: [] })).toBe(true);
    }
  });

  it("riskli izinlerden biri rolü ne olursa olsun zorunlu kılar", () => {
    for (const permission of TWO_FACTOR_REQUIRED_PERMISSIONS) {
      expect(
        requiresTwoFactor({ role: "COMPANY_STAFF", permissions: [permission] }),
      ).toBe(true);
    }
  });

  it("sıradan personel ve bayi zorunlu değil", () => {
    expect(
      requiresTwoFactor({ role: "COMPANY_STAFF", permissions: ["orders.create"] }),
    ).toBe(false);
    expect(requiresTwoFactor({ role: "SALES_REP", permissions: [] })).toBe(false);
  });

  it("salt okuma izinleri kapsamı genişletmez", () => {
    // Bilinçli sınır: görüntüleme yetkisini de kapsasaydı zorunluluk neredeyse
    // tüm ofis personeline yayılırdı.
    expect(
      requiresTwoFactor({
        role: "COMPANY_STAFF",
        permissions: ["cash.view", "payments.view"],
      }),
    ).toBe(false);
  });

  it("tanınmayan izin adı zorunluluk doğurmaz", () => {
    expect(
      requiresTwoFactor({ role: "COMPANY_STAFF", permissions: ["kaldirilmis.izin"] }),
    ).toBe(false);
  });
});

describe("twoFactorRequirementReason", () => {
  it("rolü sebep gösterir", () => {
    expect(twoFactorRequirementReason({ role: "SUPER_ADMIN", permissions: [] }))
      .toMatch(/yönetici/);
  });

  it("izni sebep gösterir", () => {
    expect(
      twoFactorRequirementReason({
        role: "COMPANY_STAFF",
        permissions: ["cash.manage"],
      }),
    ).toContain("cash.manage");
  });

  it("zorunlu olmayan hesapta sebep yok", () => {
    expect(
      twoFactorRequirementReason({ role: "COMPANY_STAFF", permissions: [] }),
    ).toBeNull();
  });
});

describe("verifySecondFactor", () => {
  const secret = generateTotpSecret();
  const row = () => ({
    totpSecret: sealSecret(secret),
    totpLastStep: null as number | null,
    totpBackupCodes: [] as string[],
  });

  it("geçerli TOTP kodunu kabul eder ve adımı döner", async () => {
    const step = currentStep();
    const check = await verifySecondFactor(row(), totpCodeForStep(secret, step));
    expect(check).toEqual({ ok: true, via: "totp", step });
  });

  it("harcanmış adımı reddeder", async () => {
    const step = currentStep();
    const check = await verifySecondFactor(
      { ...row(), totpLastStep: step },
      totpCodeForStep(secret, step),
    );
    expect(check.ok).toBe(false);
  });

  it("anahtar yoksa hiçbir kod tutmaz", async () => {
    const check = await verifySecondFactor(
      { totpSecret: null, totpLastStep: null, totpBackupCodes: [] },
      "000000",
    );
    expect(check).toEqual({ ok: false, via: null, step: null });
  });

  it("yedek kodu kabul eder — tire ve küçük harf fark etmez", async () => {
    // Özet, normalize edilmiş hâlin SHA-256'sı: tire atılır, büyük harfe
    // çevrilir. Kâğıttan okuyan kullanıcı tireyi atlayabilsin diye.
    const plain = "ABCDE-FGHJK";
    const digest = crypto
      .createHash("sha256")
      .update("ABCDEFGHJK")
      .digest("hex");

    for (const typed of [plain, "abcde-fghjk", "ABCDEFGHJK", "abcde fghjk"]) {
      const check = await verifySecondFactor(
        { ...row(), totpBackupCodes: [digest] },
        typed,
      );
      expect(check.ok, typed).toBe(true);
      if (check.ok && check.via === "backup") {
        // userId verilmediği için yazma yok, ama kalan sayısı hesaplanıyor.
        expect(check.remainingBackupCodes).toBe(0);
      } else {
        expect.unreachable("yedek kod yoluyla geçmeliydi");
      }
    }
  });

  it("listede olmayan yedek kodu reddeder", async () => {
    const digest = crypto.createHash("sha256").update("ABCDEFGHJK").digest("hex");
    const check = await verifySecondFactor(
      { ...row(), totpBackupCodes: [digest] },
      "ZZZZZ-ZZZZZ",
    );
    expect(check.ok).toBe(false);
  });

  it("önce TOTP'ye bakar; yedek kodlar dolu olsa da doğru kod TOTP sayılır", async () => {
    const digest = crypto.createHash("sha256").update("ABCDEFGHJK").digest("hex");
    const check = await verifySecondFactor(
      { ...row(), totpBackupCodes: [digest] },
      totpCodeForStep(secret, currentStep()),
    );
    expect(check.ok && check.via).toBe("totp");
  });
});
