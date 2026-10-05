import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { ACCOUNTS, seedDemoCart } from "../scripts/screens.mjs";
import {
  hataSatiriOlmamali,
  hatalariTopla,
  oturum,
  yerlesmesiniBekle,
} from "./yardimci";

// D5 · sepet:
// - Üst şeritteki sayaç kalem sayısı (önce taban birimlerin toplamı: 67).
// - Satırda birim fiyat; miktar her satırda yazılabiliyor ve koli katına
//   oturuyor (25'lik kolide 30 → 50).
// - Kupon kutusu bağlantının arkasında, yer tutucusu gerçek bir kupon değil.
// Sipariş verilmiyor. Sepet önce bilinen dört kalemle kuruluyor, sonda
// boşaltılıyor — gösterim verisinde iz kalmıyor.

let seeded = false;

test.beforeAll(async () => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL yok");
  const db = new PrismaClient();
  try {
    seeded = await seedDemoCart(db);
  } finally {
    await db.$disconnect();
  }
});

test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const db = new PrismaClient();
  try {
    const u = await db.user.findUnique({
      where: { email: ACCOUNTS.portal.email },
      select: { id: true },
    });
    if (u) await db.cartItem.deleteMany({ where: { cart: { ownerId: u.id } } });
  } finally {
    await db.$disconnect();
  }
});

test.describe("portal: sepet", () => {
  test.use({ storageState: oturum("portal") });
  test.describe.configure({ mode: "serial" });

  test("sayaç kalem sayısı; satırda birim fiyat; kupon bağlantıda", async ({ page }) => {
    test.skip(!seeded, "gösterim kalemleri yok (seed-gida)");
    const hatalar = hatalariTopla(page);
    await page.goto("/portal");
    await yerlesmesiniBekle(page);

    await expect(page.getByLabel("Sepette 4 kalem")).toBeVisible();
    await expect(page.getByText("4 kalem", { exact: true })).toBeVisible();

    const oil = page.locator("aside li").filter({ hasText: "Ayçiçek Yağı 5 L" });
    await expect(oil.getByText(/GD-YAG-5L · ₺359,50 \/ teneke/i)).toBeVisible();

    // Kupon: önce yalnız bağlantı; açınca nötr yer tutuculu kutu.
    await expect(page.getByLabel("Kupon kodu")).toHaveCount(0);
    await page.getByRole("button", { name: "Kupon kodunuz var mı?" }).click();
    const coupon = page.getByLabel("Kupon kodu");
    await expect(coupon).toBeVisible();
    await expect(coupon).toHaveAttribute("placeholder", "Kod");

    await hataSatiriOlmamali(page);
    expect(hatalar).toEqual([]);
  });

  test("miktar yazılıyor ve koli katına oturuyor", async ({ page }) => {
    test.skip(!seeded, "gösterim kalemleri yok (seed-gida)");
    const hatalar = hatalariTopla(page);
    await page.goto("/portal");
    await yerlesmesiniBekle(page);

    const box = page.getByLabel("Karton Kutu miktarı");
    await expect(box).toHaveValue("50");

    // 25'lik koli: 30 yazılınca 50'ye oturur.
    await box.fill("30");
    await box.press("Enter");
    await expect(page.getByLabel("Karton Kutu miktarı")).toHaveValue("50");

    await page.getByLabel("Karton Kutu miktarı").fill("100");
    await page.getByLabel("Karton Kutu miktarı").press("Enter");
    await expect(page.getByLabel("Karton Kutu miktarı")).toHaveValue("100");
    const line = page.locator("aside li").filter({ hasText: "Karton Kutu" });
    await expect(line.getByText("₺1.000,00")).toBeVisible();

    await hataSatiriOlmamali(page);
    expect(hatalar).toEqual([]);
  });
});
