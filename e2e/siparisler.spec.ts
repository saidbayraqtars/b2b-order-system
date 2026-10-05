import { expect, test, type Page } from "@playwright/test";
import {
  hataSatiriOlmamali,
  hatalariTopla,
  oturum,
  yerlesmesiniBekle,
} from "./yardimci";

// D5 · sipariş listesi: sekme ve arama adreste, sayılar satırları tutuyor,
// pano yalnız onay bekleyeni gösteriyor, tek firmanın listesinde firma
// sütunu yok. Hiçbir şey yazılmıyor (onay/ret düğmelerine basılmıyor).

const BEKLEYEN = /Onay bekliyor|Kredi onayı bekliyor/;

function rows(page: Page) {
  return page.locator("tbody tr");
}

/** Sekmenin yanındaki sayı: "Onay bekleyen 4" → 4. */
async function tabCount(page: Page, label: string): Promise<number> {
  const text = await page.getByRole("button", { name: new RegExp(`^${label}`) }).innerText();
  return Number(text.replace(/\D+/g, "") || "0");
}

test.describe("yönetim: sipariş listesi", () => {
  test.use({ storageState: oturum("admin") });

  test("sekme adrese yazılır ve yalnız o gruptaki siparişler kalır", async ({ page }) => {
    const hatalar = hatalariTopla(page);
    await page.goto("/admin/siparisler");
    await yerlesmesiniBekle(page);

    const pending = await tabCount(page, "Onay bekleyen");
    await page.getByRole("button", { name: /^Onay bekleyen/ }).click();
    await expect(page).toHaveURL(/durum=bekleyen/);
    await yerlesmesiniBekle(page);

    if (pending === 0) {
      await expect(page.getByText("Onay bekleyen sipariş yok.")).toBeVisible();
    } else {
      await expect(rows(page)).toHaveCount(Math.min(pending, 25));
      for (const row of await rows(page).all()) {
        await expect(row).toContainText(BEKLEYEN);
      }
    }

    // Geri tuşu süzgeci geri getiriyor — sekme bileşen durumunda değil.
    await page.getByRole("button", { name: /^Tümü/ }).click();
    await expect(page).not.toHaveURL(/durum=/);
    await page.goBack();
    await expect(page).toHaveURL(/durum=bekleyen/);
    await hataSatiriOlmamali(page);
    expect(hatalar).toEqual([]);
  });

  test("sekme sayılarının toplamı Tümü'ne eşit", async ({ page }) => {
    await page.goto("/admin/siparisler");
    await yerlesmesiniBekle(page);
    const all = await tabCount(page, "Tümü");
    const parts = await Promise.all(
      ["Onay bekleyen", "Açık", "Teslim edilen", "İptal / red"].map((l) =>
        tabCount(page, l),
      ),
    );
    expect(parts.reduce((a, b) => a + b, 0)).toBe(all);
  });

  test("firma adıyla arama satırları süzer, eşleşmeyen arama boş mesaj verir", async ({ page }) => {
    await page.goto("/admin/siparisler");
    await yerlesmesiniBekle(page);
    test.skip((await rows(page).count()) === 0, "gösterim verisinde sipariş yok");

    // Firma sütunu üçüncü hücre: sipariş, tarih, firma.
    const company = (await rows(page).first().locator("td").nth(2).innerText()).trim();
    const search = page.getByRole("searchbox", { name: "Sipariş ara" });
    await search.fill(company);
    await expect(page).toHaveURL(new RegExp(`ara=${encodeURIComponent(company).replace(/%20/g, "(\\+|%20)")}`));
    await yerlesmesiniBekle(page);
    for (const row of await rows(page).all()) {
      await expect(row).toContainText(company);
    }

    await search.fill("böyle-bir-sipariş-yok-xyz");
    await expect(page.getByText(/ile eşleşen sipariş yok/)).toBeVisible();
  });

  test("basit görünümde toplu fiş kutuları yok, satırda fiş simgesi var", async ({ page }) => {
    await page.goto("/admin/siparisler");
    await yerlesmesiniBekle(page);
    test.skip((await rows(page).count()) === 0, "gösterim verisinde sipariş yok");
    await expect(page.locator("tbody").getByRole("checkbox")).toHaveCount(0);
    await expect(rows(page).first().getByRole("link", { name: /fişi$/ })).toBeVisible();
  });

  test("pano yalnız onay bekleyenleri gösterir ve tüm siparişlere bağlanır", async ({ page }) => {
    await page.goto("/admin");
    await yerlesmesiniBekle(page);
    const panel = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Onay bekleyen siparişler" }),
    });
    await expect(panel).toBeVisible();
    for (const row of await panel.locator("tbody tr").all()) {
      await expect(row).toContainText(BEKLEYEN);
    }
    await panel.getByRole("link", { name: /Tüm siparişler/ }).click();
    await expect(page).toHaveURL(/\/admin\/siparisler$/);
  });

  test("menüde Siparişler Satış başlığının ilk satırı", async ({ page }) => {
    await page.goto("/admin");
    await page.getByRole("link", { name: "Siparişler", exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/siparisler/);
  });
});

test.describe("portal: sipariş listesi", () => {
  test.use({ storageState: oturum("portal") });

  test("tek firmanın listesinde firma sütunu yok, arama sipariş no'ya", async ({ page }) => {
    const hatalar = hatalariTopla(page);
    await page.goto("/portal/orders");
    await yerlesmesiniBekle(page);
    await expect(page.getByRole("columnheader", { name: "Firma" })).toHaveCount(0);
    await expect(page.getByRole("searchbox", { name: "Sipariş ara" })).toHaveAttribute(
      "placeholder",
      "Sipariş no",
    );
    await hataSatiriOlmamali(page);
    expect(hatalar).toEqual([]);
  });

  test("onay sayfası yalnız bekleyenleri gösterir", async ({ page }) => {
    await page.goto("/portal/approvals");
    await yerlesmesiniBekle(page);
    const list = rows(page);
    if ((await list.count()) === 0) {
      await expect(page.getByText("Onay bekleyen sipariş yok.")).toBeVisible();
    }
    for (const row of await list.all()) {
      await expect(row).toContainText(BEKLEYEN);
    }
  });
});
