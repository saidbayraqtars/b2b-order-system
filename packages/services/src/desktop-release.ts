import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

// Masaüstü kabuğunun sürüm klasörü.
//
// Kabuk (`apps/desktop`) güncellemesini **bağlı olduğu sunucudan** alıyor.
// Ayrı bir dağıtım kanalı kurulmadı: o sunucu zaten merkezden güncelleniyor
// (Adım 50), yani satıcı yeni sürümü bir kez yayımlıyor, sunucu kendini
// güncelliyor ve masaüstü dosyayı oradan çekiyor. İkinci bir kanal, iki ayrı
// yerde "hangi sürüm yayında" sorusu demekti.
//
// Klasörün içine `electron-builder` çıktısı olduğu gibi konuyor:
//   latest.yml · B2B-Kurulum-1.2.0.exe · (varsa) .blockmap
//
// Servis **dizin listesi vermiyor** ve yalnızca beklenen uzantıları
// veriyor: bu bir dosya sunucusu değil, tek amaçlı bir uç.

export function desktopReleaseDir(): string {
  return process.env.DESKTOP_RELEASE_DIR ?? path.join(process.cwd(), "var", "masaustu");
}

/** İzin verilen dosya adları — yol ayracı, üst dizin, gizli dosya yok. */
const AD = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(yml|exe|blockmap|zip)$/;

export function releaseFileAllowed(name: string): boolean {
  return AD.test(name) && !name.includes("..");
}

export interface DesktopReleaseFile {
  stream: NodeJS.ReadableStream;
  size: number;
  contentType: string;
}

const TIP: Record<string, string> = {
  ".yml": "text/yaml; charset=utf-8",
  ".exe": "application/octet-stream",
  ".blockmap": "application/octet-stream",
  ".zip": "application/zip",
};

export async function readDesktopReleaseFile(
  name: string,
): Promise<DesktopReleaseFile | null> {
  if (!releaseFileAllowed(name)) return null;
  const full = path.join(desktopReleaseDir(), name);
  try {
    const bilgi = await stat(full);
    if (!bilgi.isFile()) return null;
    return {
      stream: createReadStream(full),
      size: bilgi.size,
      contentType: TIP[path.extname(name).toLowerCase()] ?? "application/octet-stream",
    };
  } catch {
    return null;
  }
}

export interface DesktopReleaseSummary {
  version: string | null;
  file: string | null;
  size: number | null;
  releasedAt: string | null;
}

/**
 * `latest.yml`in özeti — insan ve yönetim ekranı için.
 *
 * YAML ayrıştırıcısı eklenmedi: dosyayı electron-builder üretiyor, biçimi
 * sabit ve okunacak üç alan var. Bir bağımlılık, üç satırlık düzenli ifadeden
 * daha pahalı.
 */
export async function desktopReleaseSummary(): Promise<DesktopReleaseSummary> {
  const bos: DesktopReleaseSummary = {
    version: null,
    file: null,
    size: null,
    releasedAt: null,
  };
  try {
    const ham = await readFile(path.join(desktopReleaseDir(), "latest.yml"), "utf8");
    const al = (anahtar: string): string | null => {
      const m = ham.match(new RegExp(`^${anahtar}:\\s*(.+)$`, "m"));
      return m ? m[1]!.trim().replace(/^['"]|['"]$/g, "") : null;
    };
    const boyut = ham.match(/^\s+size:\s*(\d+)$/m);
    return {
      version: al("version"),
      file: al("path"),
      size: boyut ? Number(boyut[1]) : null,
      releasedAt: al("releaseDate"),
    };
  } catch {
    return bos;
  }
}

/** Klasörde ne var — yalnızca yönetim ekranı için, dışarı verilmiyor. */
export async function desktopReleaseFiles(): Promise<string[]> {
  try {
    const hepsi = await readdir(desktopReleaseDir());
    return hepsi.filter(releaseFileAllowed).sort();
  } catch {
    return [];
  }
}
