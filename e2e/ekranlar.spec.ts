import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { SCREENS } from "../scripts/screens.mjs";
import {
  bicimliOlmali,
  hataSatiriOlmamali,
  hatalariTopla,
  oturum,
  yerlesmesiniBekle,
  type Hesap,
} from "./yardimci";

// Bütün ekranlar: ekran görüntüsü kayıt defterindeki (scripts/screens.mjs) her
// satır bir test. Kayıt defteri zaten "her biten ekran"ın listesi; ayrı bir
// liste tutmak, birinin ötekinden geri kalması demekti.
//
// Her ekranda dört şey sınanıyor: sunucu 4xx/5xx dönmüyor, sayfa biçimli,
// istemci verisi geliyor ("Yükleniyor…" kayboluyor) ve ne konsolda hata ne de
// ekranda hata satırı var. Yazma yok — gösterim verisi ekran görüntülerinin
// kaynağı, her koşuda değişmemeli.

type Screen = {
  step: number;
  slug: string;
  as: Hesap | "anon";
  path: string | ((db: PrismaClient) => Promise<string | null | undefined>);
};

// Aynı hesap + aynı adres bir kez sınanıyor (pano birkaç adımda çekiliyor).
const seen = new Set<string>();
const screens = (SCREENS as Screen[]).filter((s) => {
  const key = `${s.as} ${typeof s.path === "string" ? s.path : s.slug}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

let db: PrismaClient | null = null;
test.beforeAll(() => {
  if (process.env.DATABASE_URL) db = new PrismaClient();
});
test.afterAll(async () => {
  await db?.$disconnect();
});

const byAccount = new Map<Screen["as"], Screen[]>();
for (const s of screens) {
  byAccount.set(s.as, [...(byAccount.get(s.as) ?? []), s]);
}

for (const [hesap, list] of byAccount) {
  test.describe(`${hesap} ekranları`, () => {
    if (hesap !== "anon") test.use({ storageState: oturum(hesap) });

    for (const screen of list) {
      test(`adım ${screen.step} · ${screen.slug}`, async ({ page }) => {
        let path: string | null | undefined;
        if (typeof screen.path === "string") {
          path = screen.path;
        } else {
          test.skip(!db, "DATABASE_URL yok: adres veritabanından çözülüyor");
          path = await screen.path(db!);
        }
        test.skip(!path, "gösterim verisinde bu ekranın kaydı yok");

        const hatalar = hatalariTopla(page);
        const res = await page.goto(path!);
        expect(res?.status() ?? 0, `${path} sunucu durumu`).toBeLessThan(400);
        await bicimliOlmali(page);
        await yerlesmesiniBekle(page);
        await hataSatiriOlmamali(page);
        expect(hatalar, "konsol/istisna hatası").toEqual([]);
      });
    }
  });
}
