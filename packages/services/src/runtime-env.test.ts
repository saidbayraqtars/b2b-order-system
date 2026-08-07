import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEV_FALLBACK_SECRET,
  EnvError,
  assertRuntimeEnv,
  envProblems,
  envWarnings,
} from "./runtime-env";

// Bu kurallar üretim kurulumunun tek kapısı ve gözle görünmüyorlar: yanlış
// gevşetildiklerinde hiçbir ekran bozulmuyor, yalnızca bir müşteri sunucusu
// sessizce güvensiz açılıyor. Bu yüzden testleri var.

const KEYS = [
  "NODE_ENV",
  "DATABASE_URL",
  "AUTH_SECRET",
  "TENANT_DIR",
  "APP_URL",
  "UPLOAD_DIR",
  "SMTP_HOST",
] as const;

const SAVED: Record<string, string | undefined> = {};

/** Üretimde geçerli sayılan tam yapılandırma. */
function validProduction(): void {
  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = "postgresql://u:p@db:5432/b2b";
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TENANT_DIR = "/data/tenant";
  process.env.APP_URL = "https://siparis.musteri.com.tr";
  process.env.UPLOAD_DIR = "/data/uploads";
  process.env.SMTP_HOST = "smtp.musteri.com.tr";
}

beforeEach(() => {
  for (const k of KEYS) SAVED[k] = process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
  vi.restoreAllMocks();
});

describe("envProblems", () => {
  it("üretim dışında hiçbir şey zorunlu değil", () => {
    process.env.NODE_ENV = "development";
    for (const k of ["DATABASE_URL", "AUTH_SECRET", "TENANT_DIR", "APP_URL", "UPLOAD_DIR"]) {
      delete process.env[k];
    }
    // Yerelde yarım yapılandırmayla çalışmak normal: geliştirici .env'ini
    // doldurmadan `pnpm dev` diyebilmeli.
    expect(envProblems()).toEqual([]);
  });

  it("üretimde eksik olan her zorunlu değişkeni ayrı ayrı söyler", () => {
    validProduction();
    delete process.env.DATABASE_URL;
    delete process.env.UPLOAD_DIR;

    const problems = envProblems();
    expect(problems).toHaveLength(2);
    expect(problems.join(" ")).toContain("DATABASE_URL");
    expect(problems.join(" ")).toContain("UPLOAD_DIR");
  });

  it("boşluktan ibaret değer tanımsız sayılır", () => {
    validProduction();
    process.env.TENANT_DIR = "   ";
    expect(envProblems().join(" ")).toContain("TENANT_DIR");
  });

  it("geliştirme sabitine eşit AUTH_SECRET reddedilir", () => {
    validProduction();
    process.env.AUTH_SECRET = DEV_FALLBACK_SECRET;
    // O sabit depoda yazılı: bilen herkes kendine istediği rolde jeton üretir.
    expect(envProblems().join(" ")).toContain("AUTH_SECRET");
  });

  it("kısa AUTH_SECRET reddedilir", () => {
    validProduction();
    process.env.AUTH_SECRET = "kisa-anahtar";
    expect(envProblems()).toHaveLength(1);
  });

  it("localhost'a bakan APP_URL reddedilir", () => {
    validProduction();
    process.env.APP_URL = "http://localhost:3000";
    // E-postadaki sıfırlama bağlantısı buradan üretiliyor; müşterinin
    // tarayıcısında localhost açılmaz.
    expect(envProblems().join(" ")).toContain("APP_URL");
  });

  it("tam yapılandırmada sorun yok", () => {
    validProduction();
    expect(envProblems()).toEqual([]);
  });
});

describe("envWarnings", () => {
  it("SMTP yoksa uyarır ama durdurmaz", () => {
    validProduction();
    process.env.SMTP_HOST = "";
    expect(envWarnings().join(" ")).toContain("SMTP_HOST");
    // Uyarı, sorun değil: SMTP'siz kurulum çalışır durumdadır.
    expect(envProblems()).toEqual([]);
  });

  it("şifresiz http adresi uyarı üretir", () => {
    validProduction();
    process.env.APP_URL = "http://siparis.musteri.com.tr";
    expect(envWarnings().join(" ")).toContain("https");
    expect(envProblems()).toEqual([]);
  });

  it("üretim dışında uyarı üretilmez", () => {
    process.env.NODE_ENV = "development";
    process.env.SMTP_HOST = "";
    expect(envWarnings()).toEqual([]);
  });
});

describe("assertRuntimeEnv", () => {
  it("eksik yapılandırmada EnvError fırlatır ve hepsini mesaja koyar", () => {
    validProduction();
    delete process.env.AUTH_SECRET;
    delete process.env.APP_URL;
    vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      assertRuntimeEnv();
      expect.unreachable("fırlatmalıydı");
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      const err = e as EnvError;
      expect(err.problems).toHaveLength(2);
      // Operatör sunucuda tek satır günlük görüyor; eksiklerin hepsi orada
      // olmalı, yoksa deneme-yanılmayla tek tek bulması gerekir.
      expect(err.message).toContain("AUTH_SECRET");
      expect(err.message).toContain("APP_URL");
      expect(err.message).toContain("DEPLOYMENT.md");
    }
  });

  it("tam yapılandırmada sessiz geçer", () => {
    validProduction();
    expect(() => assertRuntimeEnv()).not.toThrow();
  });
});
