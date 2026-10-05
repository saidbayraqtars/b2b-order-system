import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { ACCOUNTS } from "../scripts/screens.mjs";
import {
  hataSatiriOlmamali,
  hatalariTopla,
  oturum,
  yerlesmesiniBekle,
} from "./yardimci";

// D5 · firma formu: künye ve ticari koşullar iki küme; sözleşme ayarları
// (asgari sipariş, ödeme kısıtı, hacim basamağı) basit görünümde yalnız
// doluysa; adres, hesap ve iskonto panelleri kapalı başlıyor ve başlıktaki
// "Yeni …" düğmesi paneli açıyor (önce kapalı panelin içinde görünmeyen bir
// form açıyordu). Hiçbir form kaydedilmiyor — gösterim verisine yazılmıyor.

let companyId: string | null = null;
/** Sözleşme ayarı olmayan firma: basit görünümde üçü de gizli olmalı. */
let plain = false;
let advancedView = false;

test.beforeAll(async () => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL yok");
  const db = new PrismaClient();
  try {
    const c = await db.company.findFirst({
      where: { isActive: true, orders: { some: {} } },
      select: {
        id: true,
        minOrderAmount: true,
        allowedPaymentMethods: true,
        volumeDiscountMode: true,
        _count: { select: { paymentTerms: true } },
      },
      orderBy: { name: "asc" },
    });
    companyId = c?.id ?? null;
    plain = Boolean(
      c &&
        c.minOrderAmount === null &&
        c.allowedPaymentMethods.length === 0 &&
        c._count.paymentTerms === 0 &&
        c.volumeDiscountMode === "AUTO",
    );
    const admin = await db.user.findUnique({
      where: { email: ACCOUNTS.admin.email },
      select: { advancedView: true },
    });
    advancedView = admin?.advancedView ?? false;
  } finally {
    await db.$disconnect();
  }
});

test.describe("yönetim: firma formu", () => {
  test.use({ storageState: oturum("admin") });

  test("iki küme; boş sözleşme ayarları basit görünümde adıyla söyleniyor", async ({ page }) => {
    test.skip(!companyId, "siparişi olan firma yok");
    const hatalar = hatalariTopla(page);
    await page.goto(`/admin/companies/${companyId}`);
    await yerlesmesiniBekle(page);

    await expect(page.getByText("Künye", { exact: true })).toBeVisible();
    await expect(page.getByText("Ticari koşullar", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kaydet" })).toBeVisible();

    if (plain && !advancedView) {
      await expect(page.getByText("Ödemede sunulacaklar")).toHaveCount(0);
      await expect(page.getByPlaceholder("genel kural")).toHaveCount(0);
      await expect(page.getByText(/Gelişmiş görünümde:.*ödeme kısıtı/)).toBeVisible();
    }

    await hataSatiriOlmamali(page);
    expect(hatalar).toEqual([]);
  });

  test("kapalı paneller: \"Yeni …\" düğmesi paneli açıyor, Vazgeç kapatıyor", async ({ page }) => {
    test.skip(!companyId, "siparişi olan firma yok");
    const hatalar = hatalariTopla(page);
    await page.goto(`/admin/companies/${companyId}`);
    await yerlesmesiniBekle(page);

    // Adres: panel kapalı, form yok; düğmeyle ikisi birden açılıyor.
    const addressToggle = page.getByRole("button", { name: /^Adresler/ });
    await expect(addressToggle).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Yeni adres" }).click();
    await expect(addressToggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Posta kodu", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Vazgeç" }).click();
    await expect(addressToggle).toHaveAttribute("aria-expanded", "false");

    // Hesap: aynı düzen.
    const userToggle = page.getByRole("button", { name: /^Hesaplar/ });
    await expect(userToggle).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Yeni kullanıcı" }).click();
    await expect(userToggle).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("button", { name: "Vazgeç" }).click();
    await expect(userToggle).toHaveAttribute("aria-expanded", "false");

    // İskonto: tek panel (eskiden "Yeni iskonto" + "Tanımlı iskontolar").
    await expect(page.getByText("Tanımlı iskontolar")).toHaveCount(0);
    const discountToggle = page.getByRole("button", { name: /^Firmaya özel iskonto/ });
    await expect(discountToggle).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Yeni iskonto" }).click();
    await expect(discountToggle).toHaveAttribute("aria-expanded", "true");
    const add = page.getByRole("button", { name: "İskontoyu ekle" });
    await expect(add).toBeVisible();
    await expect(add).toBeDisabled();
    await page.getByRole("button", { name: "Vazgeç" }).click();
    await expect(add).toHaveCount(0);

    await hataSatiriOlmamali(page);
    expect(hatalar).toEqual([]);
  });

  test("yeni firma: başlık bir kez, ad boşken oluşturulamıyor", async ({ page }) => {
    const hatalar = hatalariTopla(page);
    await page.goto("/admin/companies/new");
    await yerlesmesiniBekle(page);

    await expect(page.getByRole("heading", { name: "Yeni Firma" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Yeni firma$/i })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Firma bilgileri" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Firmayı oluştur" })).toBeDisabled();

    await hataSatiriOlmamali(page);
    expect(hatalar).toEqual([]);
  });
});
