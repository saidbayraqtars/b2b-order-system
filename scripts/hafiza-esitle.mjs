// Claude Code'un proje hafızasını (`~/.claude/projects/<proje>/memory`) depo
// içindeki `docs/hafiza/` klasörüne kopyalar. Amaç: aynı bilgiyle başka bir
// yapay zekâ aracıyla da çalışabilmek — o araçlar `~/.claude` altını görmez.
//
//   node scripts/hafiza-esitle.mjs         hafızadan depoya (varsayılan)
//   node scripts/hafiza-esitle.mjs --geri  depodan hafızaya (elle düzenledikten sonra)
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const kok = path.resolve(import.meta.dirname, "..");
// Claude Code proje klasörünü, mutlak yolun harf/rakam dışını "-" yaparak adlandırıyor.
const kodlanmis = kok.replace(/[^a-zA-Z0-9]/g, "-");
const hafiza = path.join(homedir(), ".claude", "projects", kodlanmis, "memory");
const depo = path.join(kok, "docs", "hafiza");

const geri = process.argv.includes("--geri");
const [kaynak, hedef] = geri ? [depo, hafiza] : [hafiza, depo];

if (!existsSync(kaynak)) {
  console.error(`Kaynak klasör yok: ${kaynak}`);
  process.exit(1);
}

await mkdir(hedef, { recursive: true });

// Hedefteki artık dosyalar: kaynakta silinen bir hafıza kaydı burada kalmasın.
const kaynakDosyalar = new Set((await readdir(kaynak)).filter((d) => d.endsWith(".md")));
for (const dosya of await readdir(hedef)) {
  if (dosya.endsWith(".md") && !kaynakDosyalar.has(dosya)) {
    await rm(path.join(hedef, dosya));
    console.log(`sil  ${dosya}`);
  }
}

for (const dosya of kaynakDosyalar) {
  await cp(path.join(kaynak, dosya), path.join(hedef, dosya));
}

console.log(`${kaynakDosyalar.size} dosya: ${kaynak} -> ${hedef}`);
