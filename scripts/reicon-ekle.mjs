#!/usr/bin/env node
// Reicon'dan ikon ekler: apps/web/src/components/reicon-data.ts dosyasına yazar.
//
//   node scripts/reicon-ekle.mjs it/hashtag-square settings/toggle
//   REICON_JSON=/yol/icon-data.json node scripts/reicon-ekle.mjs ...
//
// Kural (2026-09-26): gereken her yeni ikon Reicon'dan alınır
// (github.com/dqev/reicon, MIT). Tek kaynak `data/icon-data.json`; ad
// `<kategori>/<ikon>` biçiminde, ağırlık Outline. Elle çizilmiş path yok.
// Mevcut lucide ikonları kendiliğinden değiştirilmiyor; dokunulan yerde
// yeni ikon gerekiyorsa buradan geliyor.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "apps/web/src/components/reicon-data.ts");
const URL_JSON = "https://raw.githubusercontent.com/dqev/reicon/main/data/icon-data.json";

const wanted = process.argv.slice(2);
if (wanted.length === 0) {
  console.error("Kullanım: node scripts/reicon-ekle.mjs <kategori/ikon> [...]");
  process.exit(1);
}

async function loadData() {
  const local = process.env.REICON_JSON;
  if (local) return JSON.parse(readFileSync(local, "utf8"));
  const res = await fetch(URL_JSON);
  if (!res.ok) throw new Error(`Reicon indirilemedi: HTTP ${res.status}`);
  return res.json();
}

function readExisting() {
  if (!existsSync(OUT)) return {};
  const text = readFileSync(OUT, "utf8");
  const match = text.match(/= (\{[\s\S]*\});\s*$/);
  return match ? JSON.parse(match[1]) : {};
}

const data = await loadData();
const icons = readExisting();

for (const name of wanted) {
  const [category, icon] = name.split("/");
  const code = data.categories?.[category]?.icons?.[icon]?.weights?.Outline?.code;
  if (!code) {
    console.error(`Bulunamadı: ${name}`);
    process.exit(1);
  }
  icons[name] = code;
  console.log(`+ ${name}`);
}

const sorted = Object.fromEntries(Object.keys(icons).sort().map((k) => [k, icons[k]]));
writeFileSync(
  OUT,
  `// Üretilmiş dosya — elle düzenlemeyin. Kaynak: Reicon (github.com/dqev/reicon, MIT),\n` +
    `// Outline ağırlığı. Eklemek için: node scripts/reicon-ekle.mjs <kategori/ikon>\n\n` +
    `export const REICON_SVG: Record<string, string> = ${JSON.stringify(sorted, null, 2)};\n`,
);
console.log(`→ ${OUT} (${Object.keys(sorted).length} ikon)`);
