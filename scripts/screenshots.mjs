// Yenilenen ekranların görüntüsünü `docs/design/screens/` altına kaydeder.
//
//   node scripts/screenshots.mjs                # kayıt defterindeki her ekran
//   node scripts/screenshots.mjs --step 3       # yalnızca Adım 3
//   node scripts/screenshots.mjs --only admin-pano,admin-urunler
//   node scripts/screenshots.mjs --theme dark   # light | dark | both
//
// Tarayıcı **indirilmiyor**: sistemde kurulu Chrome/Edge sürülüyor
// (`puppeteer-core`). Tam `puppeteer` paketi her kurulumda ~150 MB'lık ayrı bir
// Chromium çekiyor ve bu depoda o kopyanın karşılığı yok — ekran görüntüsü
// tasarımı belgelemek için alınıyor, tarayıcılar arası uyum sınamak için değil.
//
// Ön koşullar: veritabanı ayakta ve gösterim verisiyle tohumlanmış, uygulama
// çalışıyor. `next build`/`next start` bu depoda işe yaramıyor (`output:
// standalone`), o yüzden geliştirme sunucusu kullanılıyor:
//
//   pnpm --filter web dev -- -p 3100
//   SHOT_BASE_URL=http://localhost:3100 node scripts/screenshots.mjs
//
// Geliştirme sunucusu her rotayı ilk ziyarette derliyor; gezinme zaman aşımı
// bu yüzden cömert.

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";
import { ACCOUNTS, SCREENS } from "./screens.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs", "design", "screens");
const BASE_URL = process.env.SHOT_BASE_URL ?? "http://localhost:3000";

// Masaüstü genişliği: kenar çubuğu 256 piksel ve içerik `max-w-6xl` (1152) —
// 1440 ikisini de kırpmadan alıyor. Ölçek 1: görüntü, tasarımcının ekranda
// gördüğünün birebir aynısı ve dosya deponun taşıyabileceği boyutta kalıyor
// (2x'te tek ekran 3 MB'a çıkıyordu).
const VIEWPORT = { width: 1440, height: 960, deviceScaleFactor: 1 };

/** Bundan uzun sayfa kırpılıyor — 6000 pikselden sonrası zaten okunmuyor. */
const MAX_HEIGHT = 6000;

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
  if (!hit) {
    throw new Error(
      `Chrome/Edge bulunamadı. CHROME_PATH ile yolunu verin.\nBakılan yerler:\n  ${CHROME_CANDIDATES.join("\n  ")}`,
    );
  }
  return hit;
}

function parseArgs(argv) {
  const args = { step: null, only: null, theme: "light" };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split("=");
    const value = inline ?? argv[++i];
    if (flag === "--step") args.step = Number(value);
    else if (flag === "--only") args.only = value.split(",").map((s) => s.trim());
    else if (flag === "--theme") args.theme = value;
    else throw new Error(`Bilinmeyen argüman: ${argv[i]}`);
  }
  if (!["light", "dark", "both"].includes(args.theme)) {
    throw new Error(`--theme light | dark | both olmalı, "${args.theme}" değil`);
  }
  return args;
}

/**
 * Giriş formunu doldurur.
 *
 * Oturum çerezini elle üretmiyoruz: jeton biçimi next-auth'un iç meselesi ve
 * burada taklit edilirse kimlik doğrulama değişince betik sessizce yanlış
 * ekranı çeker. Form üç saniyelik bir maliyet, karşılığında gerçek oturum.
 */
async function signIn(page, account) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });
  await page.type("#email", account.email);
  await page.type("#password", account.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);

  // İki adımlı doğrulama açık bir hesapla ekran çekilemez: kod yalnızca
  // telefonda. Sessizce giriş ekranını kaydetmektense burada duruyoruz.
  if (await page.$("#totp")) {
    throw new Error(
      `${account.email} hesabında iki adımlı doğrulama açık — gösterim hesabı kullanın`,
    );
  }
  if (page.url().includes("/login")) {
    throw new Error(`${account.email} ile giriş yapılamadı`);
  }
}

async function setTheme(page, theme) {
  await page.evaluateOnNewDocument((t) => {
    try {
      localStorage.setItem("b2b-theme", t);
    } catch {
      /* gizli sekme — tema yine sınıfla uygulanacak */
    }
  }, theme);
}

/**
 * Sayfanın "yerleşmesini" bekle.
 *
 * `networkidle2` tek başına yetmiyor: ekranların çoğu react-query ile ikinci
 * bir tur veri çekiyor ve ağ sustuğu an tabloların yerinde "Yükleniyor…"
 * yazıyor. Bekleme o metnin kaybolmasına bakıyor; kaybolmuyorsa (gerçekten boş
 * bir ekran) zaman aşımını yutup devam ediyoruz — boş ekran da bir ekrandır.
 */
async function settle(page) {
  await page
    .waitForFunction(() => !document.body.innerText.includes("Yükleniyor…"), {
      timeout: 10_000,
    })
    .catch(() => {});
  // Görsellerin çözülmesi ve geçiş animasyonlarının bitmesi için son bir soluk.
  await page
    .waitForFunction(
      () =>
        Array.from(document.images).every((img) => img.complete || !img.src),
      { timeout: 5_000 },
    )
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
}

/**
 * Görüntüyü almadan önce pencereyi sayfanın tamamı kadar büyüt.
 *
 * `fullPage: true` yerine bu: kenar çubuğu `sticky` + `h-screen` ve tam sayfa
 * kipinde yalnızca ilk ekran boyu kadar boyanıyor — altında beyaz bir şerit
 * kalıyordu. Pencereyi büyütünce "ekran boyu" sayfanın boyu oluyor ve çubuk
 * gerçekte göründüğü gibi baştan sona iniyor.
 */
async function fitViewport(page) {
  const height = await page.evaluate(() =>
    Math.ceil(
      Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      ),
    ),
  );
  await page.setViewport({
    ...VIEWPORT,
    height: Math.min(Math.max(height, VIEWPORT.height), MAX_HEIGHT),
  });
  // Yeni yüksekliğe göre yeniden yerleşim (sticky başlık, sonsuz liste) bitsin.
  await new Promise((r) => setTimeout(r, 250));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const themes = args.theme === "both" ? ["light", "dark"] : [args.theme];

  const wanted = SCREENS.filter(
    (s) =>
      (args.step === null || s.step === args.step) &&
      (args.only === null || args.only.includes(s.slug)),
  );
  if (wanted.length === 0) throw new Error("Süzgece uyan ekran yok.");

  const db = new PrismaClient();
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: "new",
    args: ["--hide-scrollbars"],
  });

  let taken = 0;
  const skipped = [];
  try {
    for (const theme of themes) {
      // Oturum hesap başına bir kez açılıyor; her ekran için yeniden giriş
      // yapmak listeyi üç katına çıkarıyordu.
      const byAccount = new Map();
      for (const screen of wanted) {
        const list = byAccount.get(screen.as) ?? [];
        list.push(screen);
        byAccount.set(screen.as, list);
      }

      for (const [as, screens] of byAccount) {
        // "anon": giriş yapılmadan çekilen ekranlar — giriş, bayi başvurusu,
        // şifre sıfırlama. Bunlar için oturum açmak sayfayı hiç göstermezdi:
        // giriş yapmış bir tarayıcı `/login`e uğramaz, uygulamaya döner.
        const account = as === "anon" ? null : ACCOUNTS[as];
        if (as !== "anon" && !account) throw new Error(`Tanımsız hesap: ${as}`);

        // Her hesap kendi yalıtılmış bağlamında: sekmeler varsayılan bağlamda
        // çerez paylaşıyor ve ikinci hesabın `/login` isteği, ilk hesabın hâlâ
        // duran oturumu yüzünden uygulamaya geri yönleniyordu.
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        page.setDefaultNavigationTimeout(120_000);
        await page.setViewport(VIEWPORT);
        await setTheme(page, theme);
        if (account) await signIn(page, account);

        for (const screen of screens) {
          const path =
            typeof screen.path === "function"
              ? await screen.path(db)
              : screen.path;
          if (!path) {
            skipped.push(`${screen.slug} (veri yok)`);
            continue;
          }

          // Pencere her ekranda taban boya dönüyor: bir önceki ekran için
          // büyütülmüş kalırsa `min-h-screen` o boyu miras alıyor ve kısa
          // sayfanın altına metrelerce boşluk ekleniyordu.
          await page.setViewport(VIEWPORT);
          await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle2" });
          await settle(page);
          await fitViewport(page);

          const dir = join(OUT_DIR, `adim-${screen.step}`);
          mkdirSync(dir, { recursive: true });
          const name =
            theme === "dark" ? `${screen.slug}-dark.png` : `${screen.slug}.png`;
          await page.screenshot({ path: join(dir, name) });
          taken++;
          console.log(`  ✔ adim-${screen.step}/${name}  ← ${path}`);
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await db.$disconnect();
  }

  console.log(`\n${taken} görüntü kaydedildi → docs/design/screens/`);
  if (skipped.length > 0) {
    console.log(`Atlanan: ${skipped.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
