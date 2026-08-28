/* eslint-disable no-console */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { seedDocumentSeries, seedLabelTemplates } from "./reference-data";
import { TEST_SCHEMA, testDatabaseUrl } from "../src/test-env";

// Test şemasını kurar: göçleri uygular ve testlerin varlığını varsaydığı
// başvuru verisini yazar.
//
// `pnpm db:test-prepare` — tekrar çalıştırılabilir ve göçler güncelse birkaç
// saniye sürüyor. `--reset` şemayı komple düşürüp yeniden kuruyor: birikmiş
// test artığını temizlemenin yolu bu, ve gösterim verisine dokunmuyor çünkü o
// başka bir şemada.
//
// Neden başvuru verisi gerekiyor: sevkiyat belge serisi olmadan numara
// alamıyor, yani sipariş akışı testleri boş bir şemada ilk sevkiyatta düşüyor.
// Bunlar gösterim verisi değil; kurulumun çalışması için gereken satırlar
// (bkz. reference-data.ts).

function loadEnv(): void {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(__dirname, "../.env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadEnv();

  const url = testDatabaseUrl();
  if (!url) {
    console.log("• DATABASE_URL yok — test şeması kurulmadı, testler atlanacak.");
    return;
  }

  const reset = process.argv.includes("--reset");
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    if (reset) {
      // Şemayı düşürmek yalnızca test şemasında yapılıyor: `public` adı
      // buraya hiç gelmemeli, çünkü orası gösterim/geliştirme verisi.
      if (TEST_SCHEMA === "public") {
        console.error("HATA: test şeması 'public' olamaz — reset reddedildi.");
        process.exit(1);
      }
      await prisma.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`,
      );
      console.log(`✓ "${TEST_SCHEMA}" şeması düşürüldü.`);
    }
    await prisma.$disconnect();
  } catch (e) {
    await prisma.$disconnect();
    console.error(
      `HATA: veritabanına bağlanılamadı — ${(e as Error).message}\n` +
        "Docker açık mı? `docker compose up -d db`",
    );
    process.exit(1);
  }

  // Göçler: Prisma şema yoksa kendisi açıyor.
  //
  // CLI doğrudan node ile çağrılıyor, `npx` ile değil: Windows'ta `npx.cmd`
  // `execFileSync` ile açılamıyor (Node 24, EINVAL — kabuk gerektiriyor) ve
  // `shell: true` adresi komut satırına yazmak demek olurdu.
  execFileSync(
    process.execPath,
    [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
    {
      cwd: resolve(__dirname, ".."),
      env: { ...process.env, DATABASE_URL: url },
      stdio: "inherit",
    },
  );

  const seeded = new PrismaClient({ datasources: { db: { url } } });
  await seedDocumentSeries(seeded);
  await seedLabelTemplates(seeded);
  await seeded.$disconnect();

  console.log(`✓ Test şeması hazır: "${TEST_SCHEMA}".`);
}

void main();
