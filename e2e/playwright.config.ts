import { defineConfig } from "@playwright/test";

// Uçtan uca sınama: gerçek tarayıcı, gerçek sunucu, gerçek çerez.
//
//   pnpm e2e                                   # sunucu 3100'de ayakta olmalı
//   E2E_BASE_URL=http://localhost:3100 pnpm e2e
//   pnpm e2e -- --grep siparis                 # yalnız bir dosya/başlık
//
// Sunucuyu betik başlatmıyor: geliştirme sunucusu hangi veritabanına
// bakacağını ortamdan alıyor ve o seçim (gösterim şeması mı, boş kurulum mu)
// testin değil kullanıcının. `DATABASE_URL` burada da gerekli — ekran kayıt
// defteri kimliği veritabanından çözüyor (scripts/screens.mjs).
//
// 2026-10-05'e kadar bu iş `scripts/e2e.mjs`teydi (puppeteer-core, elle yazılmış
// koşucu). Said Playwright istedi: koşucu, yeniden deneme, iz (trace) ve rapor
// hazır geliyor; senaryolar buraya taşındı.
//
// Tarayıcı: Playwright'ın kendi Chromium'u (`npx playwright install chromium`).
// Kurulu değilse `E2E_CHANNEL=chrome` sistemdeki Chrome'u kullanır.

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: ".",
  outputDir: "../test-results/e2e",
  // Tek işçi: geliştirme sunucusu her rotayı ilk ziyarette derliyor ve makine
  // ortak (AGENTS.md). Paralel koşu derlemeyi yarıştırıp zaman aşımı üretiyor.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { outputFolder: "../playwright-report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    navigationTimeout: 120_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    channel: process.env.E2E_CHANNEL || undefined,
  },
  projects: [
    { name: "giris", testMatch: /giris\.setup\.ts/ },
    {
      name: "ekranlar",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["giris"],
    },
  ],
});
