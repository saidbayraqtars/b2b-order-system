// Paketlenen kabuğu sunucunun güncelleme klasörüne koyar.
//
// electron-builder çıktısı `cikti/` altında; sunucu ise `DESKTOP_RELEASE_DIR`
// klasörünü servis ediyor (varsayılan: depo kökünde `var/masaustu`). Bu betik
// aradaki kopyalama — elle yapıldığında `latest.yml` unutuluyor ve güncelleme
// sessizce hiç görünmüyor.
//
// Kullanım:
//   pnpm --filter desktop paket
//   pnpm --filter desktop yayimla
//   pnpm --filter desktop yayimla -- "D:/sunucu/masaustu"

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BURASI = dirname(fileURLToPath(import.meta.url));
const CIKTI = join(BURASI, "cikti");

const hedef = resolve(
  process.argv[2] ??
    process.env.DESKTOP_RELEASE_DIR ??
    join(BURASI, "..", "..", "var", "masaustu"),
);

if (!existsSync(CIKTI)) {
  console.error("cikti/ yok — once: pnpm --filter desktop paket");
  process.exit(1);
}

mkdirSync(hedef, { recursive: true });

// Yalnızca güncelleyicinin istediği dosyalar. `B2B-Tasinabilir-*.exe` bilerek
// dışarıda: taşınabilir sürüm elden dağıtılan bir kolaylık, güncelleme akışının
// parçası değil — akışa girseydi güncelleyici onu kurulum sanardı.
const desenler = [/^latest\.yml$/, /^B2B-Kurulum-.*\.exe$/, /^B2B-Kurulum-.*\.exe\.blockmap$/];

let sayi = 0;
for (const ad of readdirSync(CIKTI)) {
  if (!desenler.some((d) => d.test(ad))) continue;
  const kaynak = join(CIKTI, ad);
  if (!statSync(kaynak).isFile()) continue;
  copyFileSync(kaynak, join(hedef, ad));
  console.log(`  ${ad}`);
  sayi += 1;
}

if (sayi === 0) {
  console.error("Kopyalanacak dosya bulunamadi.");
  process.exit(1);
}

console.log(`\n${sayi} dosya -> ${hedef}`);
console.log("Sunucu ayaktaysa: GET /api/masaustu  ile dogrulayin.");
