import { expect, test } from "@playwright/test";
import { hataSatiriOlmamali, hatalariTopla, oturum, yerlesmesiniBekle } from "./yardimci";

// F3 · stok panelinde depo seçimi ve açık satır adreste; depo seçilince
// "Depoda" sütunu ve satırda depo ayarı formu. Form kaydedilmiyor.

test.use({ storageState: oturum("admin") });

test("depo seçimi adrese yazılır ve depo sütunu çıkar", async ({ page }) => {
  const hatalar = hatalariTopla(page);
  await page.goto("/admin/stok?bolum=durum");
  await yerlesmesiniBekle(page);

  const select = page.locator("#lvl-wh");
  test.skip((await select.count()) === 0, "kurulumda depo yok");
  const options = await select.locator("option").all();
  test.skip(options.length < 2, "kurulumda depo yok");
  const value = await options[1]!.getAttribute("value");
  await select.selectOption(value!);
  await expect(page).toHaveURL(/depo=/);
  await yerlesmesiniBekle(page);
  await expect(page.getByRole("columnheader", { name: "Depoda" })).toBeVisible();

  // Satır açılınca adres `kalem=` taşır ve depo ayarı formu görünür.
  const rows = page.locator("tbody tr");
  test.skip((await rows.count()) === 0, "katalog boş");
  await rows.first().getByRole("button", { name: "Defter" }).click();
  await expect(page).toHaveURL(/kalem=/);
  await expect(page.getByText("Bu depodan sipariş alınmasın")).toBeVisible();

  // Yenileyince aynı görünüm geri geliyor.
  await page.reload();
  await yerlesmesiniBekle(page);
  await expect(page.getByText("Bu depodan sipariş alınmasın")).toBeVisible();
  await hataSatiriOlmamali(page);
  expect(hatalar).toEqual([]);
});
