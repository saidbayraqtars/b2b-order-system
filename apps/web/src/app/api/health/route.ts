import { access, constants } from "node:fs/promises";
import { prisma } from "@repo/database";
import { envProblems, loadTenant, uploadRoot } from "@repo/services";

/**
 * GET /api/health — kapsayıcı sağlık kontrolü ve güncelleme kapısı.
 *
 * Kimlik istemiyor: sağlık kontrolünü yapan şey (Docker, ters vekil, güncelleme
 * betiği) oturum açamaz. Bu yüzden dışarı yalnızca **evet/hayır** çıkıyor —
 * hangi kontrolün düştüğü görünür, neden düştüğü görünmez. Hata metni bağlantı
 * dizesi, dosya yolu ve sürüm sızdırır; sağlık ucu saldırganın keşif aracı
 * olmamalı.
 *
 * "Ayakta mı" ile "iş görebilir mi" ayrı şeyler ve burada ikincisi ölçülüyor:
 * veritabanına ulaşamayan, yarım kalmış migration'ı olan, kiracı klasörünü
 * okuyamayan ya da görsel yazamayan bir kurulum çalışıyor sayılmaz. Güncelleme
 * betiği yeni sürümü tam da buna bakarak kabul ediyor ya da geri alıyor.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Checks {
  /** Veritabanı yanıt veriyor ve yarım kalmış migration yok. */
  database: boolean;
  /** tenant.json okunabiliyor ve geçerli — yoksa belge basılamaz. */
  tenant: boolean;
  /** UPLOAD_DIR var ve yazılabilir. */
  uploads: boolean;
  /** Üretimde zorunlu ortam değişkenlerinin hepsi dolu. */
  config: boolean;
}

async function checkDatabase(): Promise<boolean> {
  try {
    // Tek sorgu iki işi birden görüyor: bağlantıyı yokluyor ve yarım kalmış
    // migration arıyor. Yarısı uygulanmış bir şema, ayakta ama yanlış çalışan
    // bir kurulum demek — "bağlandım" cevabı bunu gizlerdi.
    const rows = await prisma.$queryRaw<Array<{ pending: bigint }>>`
      SELECT count(*) AS pending
      FROM "_prisma_migrations"
      WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL
    `;
    return Number(rows[0]?.pending ?? 0) === 0;
  } catch {
    return false;
  }
}

async function checkTenant(): Promise<boolean> {
  try {
    await loadTenant();
    return true;
  } catch {
    return false;
  }
}

async function checkUploads(): Promise<boolean> {
  try {
    await access(uploadRoot(), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const [database, tenant, uploads] = await Promise.all([
    checkDatabase(),
    checkTenant(),
    checkUploads(),
  ]);

  const checks: Checks = {
    database,
    tenant,
    uploads,
    config: envProblems().length === 0,
  };

  const ok = Object.values(checks).every(Boolean);

  return Response.json(
    {
      status: ok ? "ok" : "error",
      // İmaj etiketiyle aynı değer; güncelleme betiği "yeni sürüm gerçekten
      // ayağa kalktı mı" sorusunu buna bakarak yanıtlıyor.
      version: process.env.APP_VERSION ?? "unknown",
      checks,
    },
    {
      status: ok ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
