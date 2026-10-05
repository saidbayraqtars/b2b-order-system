import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import {
  hataSatiriOlmamali,
  hatalariTopla,
  oturum,
  yerlesmesiniBekle,
} from "./yardimci";

// D5 · portal katalog:
// - Süzgeçler adreste: kategori `?kategori=`, arama `?ara=`, sıra `?sirala=`,
//   stok `?stok=1`. Ürüne girip "Katalog" ile dönen aynı süzgeci buluyor;
//   geri tuşu önceki kategoriye dönüyor.
// - Stok asgari siparişten azsa kart sebebini yazıyor ("… var · en az N
//   alınır"), detay satırı "stok yok" demiyor.
// - "Stoğa göre" sırada hizmet en başta değil.
// Sepete hiçbir şey eklenmiyor — gösterim verisine yazılmıyor.

let charcuterieId: string | null = null;
let otherCategoryId: string | null = null;

test.beforeAll(async () => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL yok");
  const db = new PrismaClient();
  try {
    const c = await db.category.findFirst({
      where: { name: "Şarküteri" },
      select: { id: true },
    });
    charcuterieId = c?.id ?? null;
    const o = await db.category.findFirst({
      where: { name: "Yağ & Sirke" },
      select: { id: true },
    });
    otherCategoryId = o?.id ?? null;
  } finally {
    await db.$disconnect();
  }
});

test.describe("portal: katalog", () => {
  test.use({ storageState: oturum("portal") });

  test("kategori ve arama adreste; detaydan dönüş süzgeci koruyor", async ({ page }) => {
    test.skip(!charcuterieId || !otherCategoryId, "gösterim kategorileri yok (seed-gida)");
    const hatalar = hatalariTopla(page);
    await page.goto("/portal");
    await yerlesmesiniBekle(page);

    const sidebar = page.locator("aside");
    await sidebar.getByRole("button", { name: "Şarküteri", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`kategori=${charcuterieId}`));
    await expect(page.getByText(/\d+ ürün · Şarküteri/)).toBeVisible();

    // Arama gecikmeli olarak adrese yazılıyor (replace).
    await page.getByPlaceholder("Ürün kodu, adı veya barkod ara…").fill("salam");
    await expect(page).toHaveURL(/ara=salam/);

    // Ürüne gir, "Katalog" ile dön: kategori ve arama yerinde.
    await page.locator("article h3 a").first().click();
    await page.waitForURL(/\/portal\/urun\//);
    // Sol menüde de "Katalog" var; dönüş bağlantısı sayfa içindeki iz satırı.
    await page.locator("a.tech-label", { hasText: "Katalog" }).click();
    await expect(page).toHaveURL(new RegExp(`kategori=${charcuterieId}`));
    await expect(page).toHaveURL(/ara=salam/);
    await expect(page.getByPlaceholder("Ürün kodu, adı veya barkod ara…")).toHaveValue("salam");

    // Başka kategori, sonra geri tuşu: önceki kategori.
    await page.getByPlaceholder("Ürün kodu, adı veya barkod ara…").fill("");
    await expect(page).not.toHaveURL(/ara=/);
    await sidebar.getByRole("button", { name: "Yağ & Sirke", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`kategori=${otherCategoryId}`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`kategori=${charcuterieId}`));
    await expect(page.getByText(/\d+ ürün · Şarküteri/)).toBeVisible();

    await hataSatiriOlmamali(page);
    expect(hatalar).toEqual([]);
  });

  test("stok asgariden az: kart sebebi yazıyor, düğme kapalı", async ({ page }) => {
    const hatalar = hatalariTopla(page);
    await page.goto("/portal");
    await yerlesmesiniBekle(page);

    const blocked = page.locator("article").filter({ hasText: /var · en az \d+ alınır/ });
    const count = await blocked.count();
    test.skip(count === 0, "gösterim verisinde asgariden az stoklu kalem yok");
    const card = blocked.first();
    await expect(card.getByRole("button", { name: /sepete ekle/ })).toHaveCount(0);
    await expect(card.locator('span[title^="Sipariş edilemez: en az"]')).toHaveCount(1);

    // Detayda satır "stok yok" değil, aynı sebep.
    await card.locator("h3 a").click();
    await page.waitForURL(/\/portal\/urun\//);
    await yerlesmesiniBekle(page);
    await expect(page.getByText(/en az \d+ \S+ alınır, stokta/)).toBeVisible();
    await expect(page.getByText("stok yok", { exact: true })).toHaveCount(0);

    await hataSatiriOlmamali(page);
    expect(hatalar).toEqual([]);
  });

  test("stoğa göre sırada hizmet en başta değil; sıra adreste", async ({ page }) => {
    const hatalar = hatalariTopla(page);
    await page.goto("/portal");
    await yerlesmesiniBekle(page);

    await page.getByLabel("Sıralama").selectOption("stock");
    await expect(page).toHaveURL(/sirala=stock/);
    const first = page.locator("article").first();
    await expect(first).toBeVisible();
    await expect(first.getByText("Hizmet", { exact: true })).toHaveCount(0);

    // Yenileyince sıra kalıyor.
    await page.reload();
    await yerlesmesiniBekle(page);
    await expect(page.getByLabel("Sıralama")).toHaveValue("stock");

    await hataSatiriOlmamali(page);
    expect(hatalar).toEqual([]);
  });
});
