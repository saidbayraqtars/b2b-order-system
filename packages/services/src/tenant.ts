import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { tenantConfigSchema, type TenantConfig } from "@repo/types";

// The tenant folder: what this installation is, and what has been customised
// for it.
//
//   tenants/<slug>/
//     tenant.json      seller identity, branding paths
//     branding/        logo, favicon, fonts
//
// **The file is the source of truth, not the database.** This folder is the
// unit of support: it gets handed over, edited by hand and pushed back. A
// database row cannot be edited that way, and keeping a copy in both places
// guarantees they drift — the customer would edit the file and see nothing
// change, which is the worst possible outcome for a support workflow.
//
// The folder is found through TENANT_DIR. There is no fallback to a built-in
// identity: a system that prints invoices must refuse to start rather than
// print somebody else's name, or nobody's.

/** Where the folder lives. Absolute, or relative to the process cwd. */
export function tenantDir(): string {
  const dir = process.env.TENANT_DIR;
  if (!dir || dir.trim() === "") {
    throw new TenantConfigError(
      "TENANT_DIR tanımlı değil — bu kurulumun hangi firmaya ait olduğu bilinmiyor. " +
        "apps/web/.env içine kiracı klasörünün yolunu yazın (örn. TENANT_DIR=../../tenants/demo).",
    );
  }
  return path.resolve(dir);
}

/**
 * A misconfiguration, not a business rule — so it is deliberately *not* a
 * BusinessError. Those map to 4xx and read as "you did something wrong"; this
 * is the operator's problem and belongs in the server log as a 500.
 */
export class TenantConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantConfigError";
  }
}

interface Cached {
  config: TenantConfig;
  /** Source file mtime; a newer file on disk invalidates the cache. */
  mtimeMs: number;
  dir: string;
}

let cache: Cached | null = null;

/**
 * Read and validate tenant.json.
 *
 * Cached against the file's mtime rather than for a fixed time: editing the
 * file and reloading the page has to be enough to see the change, because that
 * is the whole editing loop this folder exists for. The stat call is cheap
 * next to the render it precedes.
 */
export async function loadTenant(): Promise<TenantConfig> {
  const dir = tenantDir();
  const file = path.join(dir, "tenant.json");

  let mtimeMs: number;
  try {
    mtimeMs = (await stat(file)).mtimeMs;
  } catch {
    throw new TenantConfigError(
      `Kiracı dosyası bulunamadı: ${file} — TENANT_DIR doğru klasörü gösteriyor mu?`,
    );
  }

  if (cache && cache.dir === dir && cache.mtimeMs === mtimeMs) return cache.config;

  const raw = await readFile(file, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new TenantConfigError(
      `${file} geçerli JSON değil: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const result = tenantConfigSchema.safeParse(parsed);
  if (!result.success) {
    // Every complaint at once, with its path — a half-filled file should take
    // one edit to fix, not one round trip per field.
    const problems = result.error.issues
      .map((i) => `  · ${i.path.join(".") || "(kök)"}: ${i.message}`)
      .join("\n");
    throw new TenantConfigError(`${file} eksik ya da hatalı:\n${problems}`);
  }

  cache = { config: result.data, mtimeMs, dir };
  return result.data;
}

/** Drop the cache. For tests and for a future "yapılandırmayı yenile" action. */
export function clearTenantCache(): void {
  cache = null;
}

// ─────────────────────────────────────────────
// BRANDING ASSETS
// ─────────────────────────────────────────────

/** Only what a browser renders as a mark. Anything else is not a logo. */
const ASSET_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

export interface BrandingAsset {
  data: Buffer;
  mime: string;
}

/**
 * Read a branding file by its path relative to the tenant folder.
 *
 * Two containments, because this path comes off a URL: the extension must be
 * one we serve, and the resolved path must still be inside the tenant folder —
 * a crafted `../` in the URL would otherwise read anything the process can.
 *
 * Returns null rather than throwing: a missing logo is a page that renders
 * without one, not a failed invoice.
 */
export async function readBrandingAsset(
  segments: string[],
): Promise<BrandingAsset | null> {
  if (segments.length === 0) return null;

  const mime = ASSET_TYPES[path.extname(segments[segments.length - 1]!).toLowerCase()];
  if (!mime) return null;

  const root = path.join(tenantDir(), "branding");
  const target = path.resolve(root, ...segments);
  if (target !== root && !target.startsWith(root + path.sep)) return null;

  try {
    return { data: await readFile(target), mime };
  } catch {
    return null;
  }
}

/**
 * The URL a branding path in tenant.json turns into.
 *
 * Paths in the file are written relative to the tenant folder ("branding/
 * logo.svg"), because that is how they look when someone opens the folder. The
 * route serves the `branding/` subtree, so the prefix comes off here — in one
 * place, rather than in every template that shows the logo.
 */
export function brandingUrl(relative: string | undefined): string | null {
  if (!relative) return null;
  const clean = relative.replace(/^\.?\//, "").replace(/^branding\//, "");
  if (clean === "" || clean.includes("..")) return null;
  return `/api/branding/${clean.split("/").map(encodeURIComponent).join("/")}`;
}
