/* eslint-disable no-console */
import { prisma } from "@repo/database";
import { applySetupPack, getSetupStatus, listSetupPacks } from "./setup";

/**
 * Kurulum paketini komut satırından uygular.
 *
 * Aynı işi yönetim panelindeki sihirbaz da yapıyor; bu giriş noktası kurulum
 * betiği (`scripts/install.sh`) için var: müşterinin sunucusu açıldığında
 * sistem boş bir ekranla değil, sektörün iskeletiyle karşılasın. Kurulumu yapan
 * kişiye kalan iş firma bilgileri, ürün ve müşteri olsun.
 *
 * Kullanım:
 *   pnpm --filter @repo/services setup:pack gida-toptan
 *   SETUP_PACK=genel-toptan pnpm --filter @repo/services setup:pack
 */

async function main(): Promise<void> {
  const key = (process.argv[2] ?? process.env.SETUP_PACK ?? "").trim();

  if (key === "" || key === "--list") {
    console.log("Kullanılabilir paketler:");
    for (const p of listSetupPacks()) {
      console.log(`  ${p.key.padEnd(16)} ${p.name} — ${p.summary}`);
    }
    if (key === "") {
      console.error("\nHATA: paket adı verilmedi.");
      process.exitCode = 1;
    }
    return;
  }

  const report = await applySetupPack(key);
  const line = (bag: Record<string, number>) => {
    const parts = Object.entries(bag).map(([k, n]) => `${n} ${k.toLowerCase()}`);
    return parts.length > 0 ? parts.join(", ") : "yok";
  };

  console.log(`✓ Paket uygulandı: ${report.pack}`);
  console.log(`  yazılan     : ${line(report.created)}`);
  console.log(`  dokunulmayan: ${line(report.skipped)}`);

  const status = await getSetupStatus();
  console.log(
    `  kurulum     : ${status.progress.done}/${status.progress.total} adım` +
      (status.ready ? " — hazır" : ""),
  );
  // Kalan iş açıkça yazılıyor: paketten sonra ekrana bakan kişi neyin eksik
  // olduğunu tahmin etmesin.
  const missing = status.steps.filter((s) => !s.done && !s.optional).map((s) => s.key);
  if (missing.length > 0) {
    console.log(`  kalan adım  : ${missing.join(", ")}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
