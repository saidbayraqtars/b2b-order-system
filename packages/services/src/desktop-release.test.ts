import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  desktopReleaseFiles,
  desktopReleaseSummary,
  readDesktopReleaseFile,
  releaseFileAllowed,
} from "./desktop-release";

// Masaüstü sürüm klasörü.
//
// Testin ağırlığı **ne verilmediğinde**: bu uç kimlik istemiyor (güncelleyici
// oturum açamaz) ve bir klasörü servis ediyor. Ad süzgeci burada bir kolaylık
// değil, güvenlik sınırı — düşerse uç, sunucunun diskini okuyan bir kapı olur.

const eski = process.env.DESKTOP_RELEASE_DIR;

afterEach(() => {
  if (eski === undefined) delete process.env.DESKTOP_RELEASE_DIR;
  else process.env.DESKTOP_RELEASE_DIR = eski;
});

function klasor(): string {
  const yol = mkdtempSync(join(tmpdir(), "masaustu-"));
  process.env.DESKTOP_RELEASE_DIR = yol;
  return yol;
}

describe("sürüm dosyası adı", () => {
  it("güncelleyicinin istediği dosyalar geçiyor", () => {
    expect(releaseFileAllowed("latest.yml")).toBe(true);
    expect(releaseFileAllowed("B2B-Kurulum-1.2.0.exe")).toBe(true);
    expect(releaseFileAllowed("B2B-Kurulum-1.2.0.exe.blockmap")).toBe(true);
  });

  it("yol geçişi ve gizli dosya geçmiyor", () => {
    expect(releaseFileAllowed("../.env")).toBe(false);
    expect(releaseFileAllowed("..\\.env")).toBe(false);
    expect(releaseFileAllowed(".gizli.yml")).toBe(false);
    expect(releaseFileAllowed("alt/klasor/latest.yml")).toBe(false);
  });

  it("beklenmeyen uzanti gecmiyor", () => {
    // Klasöre yanlışlıkla düşen bir yapılandırma dosyası, servis edilebilir
    // olmamalı: uç tek amaçlı ve amacı dosya sunuculuğu değil.
    expect(releaseFileAllowed("ayarlar.json")).toBe(false);
    expect(releaseFileAllowed("notlar.txt")).toBe(false);
    expect(releaseFileAllowed("")).toBe(false);
  });
});

describe("sürüm okuma", () => {
  it("yayımlanmış sürüm yoksa boş özet, hata değil", async () => {
    klasor();
    const ozet = await desktopReleaseSummary();
    expect(ozet.version).toBeNull();
    expect(await desktopReleaseFiles()).toEqual([]);
  });

  it("latest.yml özeti okunuyor", async () => {
    const yol = klasor();
    writeFileSync(
      join(yol, "latest.yml"),
      [
        "version: 1.4.2",
        "files:",
        "  - url: B2B-Kurulum-1.4.2.exe",
        "    sha512: abc==",
        "    size: 81946479",
        "path: B2B-Kurulum-1.4.2.exe",
        "sha512: abc==",
        "releaseDate: '2026-08-30T10:00:00.000Z'",
      ].join("\n"),
      "utf8",
    );

    const ozet = await desktopReleaseSummary();
    expect(ozet.version).toBe("1.4.2");
    expect(ozet.file).toBe("B2B-Kurulum-1.4.2.exe");
    expect(ozet.size).toBe(81_946_479);
    expect(ozet.releasedAt).toBe("2026-08-30T10:00:00.000Z");
  });

  it("izin verilmeyen ad diske hiç gitmiyor", async () => {
    const yol = klasor();
    writeFileSync(join(yol, "sir.json"), "{}", "utf8");
    expect(await readDesktopReleaseFile("sir.json")).toBeNull();
  });

  it("olmayan dosya null", async () => {
    klasor();
    expect(await readDesktopReleaseFile("latest.yml")).toBeNull();
  });
});
