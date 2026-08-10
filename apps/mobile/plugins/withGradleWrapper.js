const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("@expo/config-plugins");

// Gradle sarmalayıcısının indirme ayarları.
//
// Şablon iki seçimle geliyor ve ikisi de yavaş bir hat için yanlış: dağıtım
// olarak `-all` (kaynak ve belgelerle birlikte, ~220 MB) ve okuma zaman aşımı
// olarak 10 saniye. İlk derleme bu yüzden ağ hatasıyla düşüyordu — üstelik hata
// derlemenin kendisiyle ilgiliymiş gibi görünüyor.
//
// `-bin` derlemek için yeterli olanı indiriyor; zaman aşımı beş dakikaya
// çıkıyor. android/ klasörü her prebuild'de baştan üretildiği için bu düzeltme
// elle yapılamaz, eklenti olmak zorunda.
module.exports = function withGradleWrapper(config) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const file = path.join(
        cfg.modRequest.platformProjectRoot,
        "gradle",
        "wrapper",
        "gradle-wrapper.properties",
      );
      if (fs.existsSync(file)) {
        const patched = fs
          .readFileSync(file, "utf8")
          .replace(/gradle-([\d.]+)-all\.zip/, "gradle-$1-bin.zip")
          .replace(/^networkTimeout=.*$/m, "networkTimeout=300000");
        fs.writeFileSync(file, patched);
      }
      return cfg;
    },
  ]);
};
