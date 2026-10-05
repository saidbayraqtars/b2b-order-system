import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import {
  hataSatiriOlmamali,
  hatalariTopla,
  oturum,
  yerlesmesiniBekle,
} from "./yardimci";

// D5 · ürün formu: Tip seçimi (ürün/hizmet), yeni varyant formu düğmenin
// arkasında, kapalı başlayan "Fiyat geçmişi" paneli; hizmette stok alanı yok,
// portalda hizmet "Tükendi" değil "Hizmet". Hiçbir form kaydedilmiyor —
// gösterim verisine yazılmıyor.
//
// Veri seed-gida'dan: GD-YAG-5L'nin fiyat geçmişi ve "Nakliye (Şehir İçi)"
// hizmeti. Yoksa test atlanır.

let goodsId: string | null = null;
let serviceId: string | null = null;

test.beforeAll(async () => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL yok");
  const db = new PrismaClient();
  try {
    const goods = await db.product.findFirst({
      where: { type: "GOODS", variants: { some: { priceHistory: { some: {} } } } },
      select: { id: true },
      orderBy: { name: "asc" },
    });
    goodsId = goods?.id ?? null;
    const service = await db.product.findFirst({
      where: { type: "SERVICE", isActive: true },
      select: { id: true },
      orderBy: { name: "asc" },
    });
    serviceId = service?.id ?? null;
  } finally {
    await db.$disconnect();
  }
});

/** Tip seçimi: "Hizmet" seçeneğini taşıyan tek açılır liste. */
function typeSelect(page: Page) {
  return page.locator("select").filter({ has: page.locator('option[value="SERVICE"]') });
}

test.describe("yönetim: ürün formu", () => {
  test.use({ storageState: oturum("admin") });

  test("mal: tip Ürün, yeni varyant formu düğmede açılıp kapanıyor", async ({ page }) => {
    test.skip(!goodsId, "fiyat geçmişi olan ürün yok (seed-gida)");
    const hatalar = hatalariTopla(page);
    await page.goto(`/admin/products/${goodsId}`);
    await yerlesmesiniBekle(page);

    await expect(typeSelect(page)).toHaveValue("GOODS");
    // Kayıtlı ürünün kategorisi dolu görünüyor (eskiden bir an "Seçin…").
    const category = page.locator("select").filter({ has: page.locator('option[value=""]') }).first();
    await expect(category).not.toHaveValue("");

    // Malın satırında stok kutusu var.
    await expect(page.getByText("hizmet · stok tutulmaz")).toHaveCount(0);
    await expect(page.getByText("Stok", { exact: true }).first()).toBeVisible();

    // Yeni varyant formu kapalı başlıyor; düğmeyle açılıp Vazgeç ile kapanıyor.
    const addForm = page.getByRole("button", { name: "Varyant ekle" });
    await expect(addForm).toHaveCount(0);
    await page.getByRole("button", { name: "Yeni varyant" }).click();
    await expect(addForm).toBeVisible();
    await page.getByRole("button", { name: "Vazgeç" }).click();
    await expect(addForm).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Yeni varyant" })).toBeVisible();

    await hataSatiriOlmamali(page);
    expect(hatalar).toEqual([]);
  });

  test("fiyat geçmişi kapalı başlıyor, künyesi sayıyı söylüyor, açılınca satırlar", async ({ page }) => {
    test.skip(!goodsId, "fiyat geçmişi olan ürün yok (seed-gida)");
    const hatalar = hatalariTopla(page);
    await page.goto(`/admin/products/${goodsId}`);
    await yerlesmesiniBekle(page);

    const toggle = page.getByRole("button", { name: /Fiyat geçmişi/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toContainText(/\d+ değişiklik · son \d{2}\.\d{2}\.\d{4}/);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const table = page.locator("table").filter({
      has: page.getByRole("columnheader", { name: "Kaynak" }),
    });
    await expect(table).toBeVisible();
    await expect(table.locator("tbody tr").first()).toBeVisible();
    // seed-gida: ERP ile açıldı ("yeni"), toplu ve zamanlı zam, grup fiyatı elle.
    await expect(table.getByRole("cell", { name: "yeni", exact: true })).toBeVisible();
    await expect(table.getByText(/^Zamanlı/)).toBeVisible();
    await expect(table.getByText("Zincir Market")).toBeVisible();

    // Kapatınca tablo gidiyor (açık/kapalı tercih tarayıcıda saklanıyor).
    await toggle.click();
    await expect(table).toHaveCount(0);

    await hataSatiriOlmamali(page);
    expect(hatalar).toEqual([]);
  });

  test("hizmet: tip Hizmet, stok kutusu ve koli bilgisi yok", async ({ page }) => {
    test.skip(!serviceId, "hizmet ürünü yok (seed-gida)");
    const hatalar = hatalariTopla(page);
    await page.goto(`/admin/products/${serviceId}`);
    await yerlesmesiniBekle(page);

    await expect(typeSelect(page)).toHaveValue("SERVICE");
    await expect(page.getByText("hizmet · stok tutulmaz")).toBeVisible();
    await expect(page.getByText(/^koli \d+ · min/)).toHaveCount(0);

    // Yeni varyant formunda da stok alanı çizilmiyor.
    await page.getByRole("button", { name: "Yeni varyant" }).click();
    const newForm = page.locator("div.border-dashed").filter({
      has: page.getByRole("button", { name: "Varyant ekle" }),
    });
    await expect(newForm).toBeVisible();
    await expect(newForm.getByText("Stok", { exact: true })).toHaveCount(0);
    await expect(newForm.getByText("Kritik stok")).toHaveCount(0);

    await hataSatiriOlmamali(page);
    expect(hatalar).toEqual([]);
  });
});

test.describe("portal: hizmet", () => {
  test.use({ storageState: oturum("portal") });

  test("ürün detayında stok yerine \"Hizmet\" yazıyor, Tükendi yok", async ({ page }) => {
    test.skip(!serviceId, "hizmet ürünü yok (seed-gida)");
    const hatalar = hatalariTopla(page);
    await page.goto(`/portal/urun/${serviceId}`);
    await yerlesmesiniBekle(page);

    await expect(page.getByText("Hizmet", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Tükendi")).toHaveCount(0);
    // Koli içi adet hizmette anlamsız; satırda yazmıyor.
    await expect(page.getByText(/^KOL \d+$/)).toHaveCount(0);

    await hataSatiriOlmamali(page);
    expect(hatalar).toEqual([]);
  });
});
