// Tarayıcı seviyesinde uçtan uca sınama.
//
//   node scripts/e2e.mjs
//   E2E_BASE_URL=http://localhost:3100 node scripts/e2e.mjs
//
// **Playwright kurulmadı.** `puppeteer-core` zaten bağımlılıkta (ekran
// görüntüsü betiği kullanıyor) ve sistemdeki Chrome'u sürüyor; ikinci bir
// tarayıcı otomasyon paketi + kendi indirdiği tarayıcı, bu depoda karşılığı
// olmayan bir maliyet. Sınanan şey tarayıcılar arası uyum değil, uygulamanın
// gerçek bir tarayıcıda ayakta durup durmadığı.
//
// Vitest'in içinden değil kendi betiğinden koşuyor, iki sebeple: çalışan bir
// sunucu gerekiyor (birim takımı hiçbir şeye ihtiyaç duymadan koşabilmeli) ve
// tek bir tarayıcı örneği bütün senaryolarca paylaşılıyor.
//
// Neyi kanıtlıyor — ve neyi kanıtlamıyor:
//
//  ✔ Sayfa gerçekten **boyanıyor**: stil sayfası var, gövde beklenen başlığı
//    taşıyor, konsolda hata yok. Sunucu bileşeni testleri bunu göremiyor,
//    çünkü orada JSX ağacı hiç çizilmiyor.
//  ✔ Giriş, gezinme ve yetki yönlendirmesi **gerçek çerezle** çalışıyor.
//  ✔ İstemci tarafı veri çekme (react-query) dönüyor: "Yükleniyor…" kayboluyor.
//  ✘ Yazma işlemleri denenmiyor. Gösterim veritabanına sipariş geçen bir e2e,
//    ekran görüntülerinin kaynağını her koşuda değiştirirdi.

import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { ACCOUNTS } from "./screens.mjs";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

function findBrowser() {
  const hit = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!hit) throw new Error("Chrome/Edge bulunamadı. CHROME_PATH ile yolunu verin.");
  return hit;
}

// ─────────────────────────────────────────────
// SENARYOLAR
// ─────────────────────────────────────────────

/**
 * Her satır: hangi hesapla, hangi adres, sayfada ne yazmalı.
 *
 * `expect` bir metin: sayfanın **boyandığının** kanıtı. Bir seçici yerine metin
 * seçilmesi bilinçli — sınıf adı tasarım değiştiğinde kırılır ve o kırılma
 * hiçbir şey öğretmez; başlık değiştiğinde kırılan test ise gerçekten bir şeyin
 * değiştiğini söyler.
 */
const SCENARIOS = [
  { as: "anon", path: "/login", expect: "Portala giriş yapın" },
  // Başlık, üst etiket değil: `tech-label` büyük harfe çeviriyor ve
  // `innerText` çevrilmiş hâli döndürüyor.
  { as: "anon", path: "/kayit", expect: "Bayi olmak için başvurun" },
  { as: "anon", path: "/", expect: "Giriş yap" },

  { as: "admin", path: "/admin", expect: "Panel" },
  { as: "admin", path: "/admin/products", expect: "Ürünler" },
  { as: "admin", path: "/admin/companies", expect: "Firmalar" },
  { as: "admin", path: "/admin/kasa", expect: "Kasa" },
  { as: "admin", path: "/admin/stok?bolum=durum", expect: "Stok defteri" },
  { as: "admin", path: "/admin/analitik?bolum=durum", expect: "Yönetici panosu" },
  { as: "admin", path: "/admin/reports?bolum=satis", expect: "Hazır raporlar" },
  { as: "admin", path: "/admin/toplu-guncelleme", expect: "Toplu güncelleme" },
  { as: "admin", path: "/reports", expect: "Raporlarım" },
  { as: "admin", path: "/hesabim", expect: "Hesabım" },

  { as: "portal", path: "/portal", expect: "KOD:" },
  { as: "portal", path: "/portal/orders", expect: "Sipariş" },
  { as: "portal", path: "/portal/statement", expect: "Ekstre" },

  { as: "rep", path: "/rep", expect: "Portföy" },
  { as: "rep", path: "/rep/ziyaret", expect: "ziyaret" },
  { as: "courier", path: "/kurye", expect: "Teslim" },
];

/**
 * Yetki yönlendirmeleri — kapının gerçek tarayıcıda da kapalı olduğu.
 *
 * Sayfa testleri `redirect()`in fırlattığı hatayı okuyor; burada okunan şey
 * kullanıcının **nerede bittiği**. İkisi ayrı şeyler: ara katman, kabuk ve
 * istemci tarafı yönlendirme araya girebilir.
 */
const REDIRECTS = [
  { as: "portal", path: "/admin", endsAt: "/portal" },
  { as: "rep", path: "/admin/kasa", endsAt: "/rep" },
  { as: "courier", path: "/admin", endsAt: "/kurye" },
  { as: "anon", path: "/admin", endsAt: "/login" },
];

// ─────────────────────────────────────────────

async function signIn(page, account) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });
  await page.type("#email", account.email);
  await page.type("#password", account.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60_000 }),
    page.click('button[type="submit"]'),
  ]);
  if (page.url().includes("/login")) {
    throw new Error(`Giriş başarısız: ${account.email}`);
  }
}

async function settle(page) {
  await page
    .waitForFunction(() => !document.body.innerText.includes("Yükleniyor…"), {
      timeout: 15_000,
    })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 250));
}

const results = { passed: 0, failed: 0 };

function ok(name) {
  results.passed += 1;
  console.log(`  ✔ ${name}`);
}

function fail(name, reason) {
  results.failed += 1;
  console.log(`  ✘ ${name}\n      ${reason}`);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: "new",
    args: ["--hide-scrollbars"],
  });

  try {
    // Hesap başına tek bağlam: sekmeler varsayılan bağlamda çerez paylaşıyor ve
    // ikinci hesabın girişi ilkinin oturumuna takılıyordu.
    const byAccount = new Map();
    for (const s of [...SCENARIOS, ...REDIRECTS]) {
      byAccount.set(s.as, [...(byAccount.get(s.as) ?? []), s]);
    }

    for (const [as, items] of byAccount) {
      console.log(`\n${as}:`);
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width: 1440, height: 900 });

      // Konsol hatası bir bulgudur: React'in "hydration failed" uyarısı da,
      // düşen bir istek de burada görünüyor ve başka hiçbir testte görünmüyor.
      const consoleErrors = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(String(err)));

      if (as !== "anon") await signIn(page, ACCOUNTS[as]);

      for (const item of items) {
        const name = `${as} → ${item.path}`;
        consoleErrors.length = 0;
        try {
          await page.goto(`${BASE_URL}${item.path}`, {
            waitUntil: "networkidle2",
            timeout: 90_000,
          });
          await settle(page);

          if (item.endsAt) {
            const url = new URL(page.url());
            if (url.pathname !== item.endsAt) {
              fail(name, `beklenen ${item.endsAt}, gelinen ${url.pathname}`);
              continue;
            }
            ok(`${name} → ${item.endsAt}`);
            continue;
          }

          const state = await page.evaluate(() => ({
            sheets: document.styleSheets.length,
            margin: getComputedStyle(document.body).marginTop,
            text: document.body.innerText,
          }));

          // Ekran görüntüsü betiğindeki `assertStyled` ile aynı ölçüt: ham HTML
          // `{sheets: 0, margin: "8px"}` veriyor.
          if (state.sheets === 0 || state.margin !== "0px") {
            fail(name, `biçimsiz sayfa (stil: ${state.sheets}, margin: ${state.margin})`);
            continue;
          }
          if (!state.text.includes(item.expect)) {
            fail(name, `"${item.expect}" sayfada yok`);
            continue;
          }
          // Kaynak yüklenememesi (404 chunk) sessizce geçmesin.
          const fatal = consoleErrors.filter(
            (e) => !e.includes("Download the React DevTools"),
          );
          if (fatal.length > 0) {
            fail(name, `konsol hatası: ${fatal[0]}`);
            continue;
          }
          ok(name);
        } catch (e) {
          fail(name, e instanceof Error ? e.message : String(e));
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(
    `\n${results.passed} geçti, ${results.failed} kaldı (${BASE_URL}).`,
  );
  if (results.failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
