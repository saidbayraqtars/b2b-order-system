import { defineConfig } from "vitest/config";

// Ajanın testleri veritabanı istemez ve istemediği için değerli: yazma yolunun
// tamamı (numaralandırma, mükerrer kontrolü, eşleşmeyen kod, şemaya uyumlu
// INSERT) sahte bir işlem üzerinden koşuyor. Gerçek SQL Server'a karşı doğrulama
// ayrı bir iş ve kılavuzun §43.2 kontrol listesine ait.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
