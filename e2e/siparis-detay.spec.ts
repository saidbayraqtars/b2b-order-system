import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import {
  hataSatiriOlmamali,
  hatalariTopla,
  oturum,
  yerlesmesiniBekle,
} from "./yardimci";

// D5 · sipariş detayı: satır sevk durumu, sevk başlamış siparişte iptal yok,
// irsaliye/fatura formu düğmenin arkasında. Formlar açılıp kapatılıyor ama
// gönderilmiyor — gösterim verisine yazılmıyor.

let partialOrderId: string | null = null;

test.beforeAll(async () => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL yok");
  const db = new PrismaClient();
  try {
    // Kısmi sevkli sipariş: irsaliyesi var, sipariş hâlâ hazırlanıyor.
    const o = await db.order.findFirst({
      where: { shipments: { some: {} }, status: "PROCESSING" },
      select: { id: true },
    });
    partialOrderId = o?.id ?? null;
  } finally {
    await db.$disconnect();
  }
});

function statusPanel(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: "Durum güncelle" }),
  });
}

test.describe("yönetim: sipariş detayı", () => {
  test.use({ storageState: oturum("admin") });

  test("kısmi sevkte satırlar durumunu sayıyla söyler, iptal geçişi yok", async ({ page }) => {
    test.skip(!partialOrderId, "gösterim verisinde kısmi sevkli sipariş yok");
    const hatalar = hatalariTopla(page);
    await page.goto(`/orders/${partialOrderId}`);
    await yerlesmesiniBekle(page);

    await expect(page.getByRole("columnheader", { name: "Sevk" })).toBeVisible();
    await expect(page.locator("tbody").getByText(/^Kısmi \d+(,\d+)?\/\d+/)).not.toHaveCount(0);
    await expect(page.locator("tbody").getByText(/^(Bekliyor|Gönderildi|Kısmi|İade)/).first()).toBeVisible();

    const panel = statusPanel(page);
    if ((await panel.count()) > 0) {
      await expect(panel.getByRole("button", { name: "İptal", exact: true })).toHaveCount(0);
    }
    await hataSatiriOlmamali(page);
    expect(hatalar).toEqual([]);
  });

  test("irsaliye formu düğmeyle açılır, Vazgeç ile kapanır", async ({ page }) => {
    test.skip(!partialOrderId, "gösterim verisinde kısmi sevkli sipariş yok");
    await page.goto(`/orders/${partialOrderId}`);
    await yerlesmesiniBekle(page);

    const open = page.getByRole("button", { name: "Yeni irsaliye" });
    await expect(page.getByRole("button", { name: /^Sevk et/ })).toHaveCount(0);
    await open.click();
    await expect(page.getByRole("button", { name: /^Sevk et/ })).toBeVisible();
    await page.getByRole("button", { name: "Vazgeç" }).first().click();
    await expect(page.getByRole("button", { name: /^Sevk et/ })).toHaveCount(0);
    await expect(open).toBeVisible();
  });

  test("fatura formu da düğmenin arkasında", async ({ page }) => {
    test.skip(!partialOrderId, "gösterim verisinde kısmi sevkli sipariş yok");
    await page.goto(`/orders/${partialOrderId}`);
    await yerlesmesiniBekle(page);
    await expect(page.getByRole("button", { name: "Fatura kes" })).toHaveCount(0);
    await page.getByRole("button", { name: "Yeni fatura" }).click();
    await expect(page.getByRole("button", { name: "Fatura kes" })).toBeVisible();
  });

  test("boş iskonto sütunu çizilmez", async ({ page }) => {
    test.skip(!partialOrderId, "gösterim verisinde kısmi sevkli sipariş yok");
    await page.goto(`/orders/${partialOrderId}`);
    await yerlesmesiniBekle(page);
    const header = page.getByRole("columnheader", { name: "İskonto" });
    if ((await header.count()) > 0) {
      // Sütun varsa en az bir satırda değer olmalı.
      await expect(page.locator("tbody td").filter({ hasText: /^₺/ })).not.toHaveCount(0);
    }
  });
});

test.describe("portal: sipariş detayı", () => {
  test.use({ storageState: oturum("portal") });

  test("sevk başlamış siparişte müşteriye iptal düğmesi çıkmaz", async ({ page }) => {
    test.skip(!partialOrderId, "gösterim verisinde kısmi sevkli sipariş yok");
    const hatalar = hatalariTopla(page);
    const res = await page.goto(`/orders/${partialOrderId}`);
    test.skip((res?.status() ?? 0) >= 400, "sipariş bu bayinin değil");
    await yerlesmesiniBekle(page);
    await expect(page.getByRole("button", { name: "İptal", exact: true })).toHaveCount(0);
    // Belge formları yalnız satıcıda.
    await expect(page.getByRole("button", { name: "Yeni irsaliye" })).toHaveCount(0);
    expect(hatalar).toEqual([]);
  });
});
