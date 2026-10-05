import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { ACCOUNTS } from "../scripts/screens.mjs";

export type Hesap = keyof typeof ACCOUNTS;
export const HESAPLAR = Object.keys(ACCOUNTS) as Hesap[];

/** Hesabın oturum dosyası — `giris.setup.ts` yazar, testler okur. */
export function oturum(hesap: Hesap): string {
  return join(__dirname, ".auth", `${hesap}.json`);
}

/**
 * Sayfadaki hataları toplar: yakalanmamış istisna ve konsol hatası.
 *
 * Konsol hatası bir bulgudur: React'in "hydration failed" uyarısı da, düşen bir
 * istek de burada görünüyor ve başka hiçbir testte görünmüyor. Dönen dizi
 * canlı — test sonunda boş olmalı.
 */
export function hatalariTopla(page: Page): string[] {
  const hatalar: string[] = [];
  page.on("pageerror", (err) => hatalar.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes("Download the React DevTools")) return;
    // Tarayıcının "Failed to load resource" satırı adres taşımıyor; aynı
    // olay aşağıda adresiyle yazılıyor.
    if (text.startsWith("Failed to load resource")) return;
    hatalar.push(text);
  });
  // Düşen istek adresiyle: "500 /api/admin/payment-intents" hangi ucun
  // bozulduğunu söylüyor, konsol satırı söylemiyor.
  page.on("response", (res) => {
    if (res.status() < 400) return;
    const url = new URL(res.url());
    if (url.origin !== new URL(page.url() || res.url()).origin) return;
    hatalar.push(`${res.status()} ${url.pathname}${url.search}`);
  });
  return hatalar;
}

/**
 * İstemci verisi gelene kadar bekle: ekranların çoğu react-query ile ikinci
 * bir tur veri çekiyor ve ağ sustuğu an tablonun yerinde "Yükleniyor…" yazıyor.
 */
export async function yerlesmesiniBekle(page: Page): Promise<void> {
  await expect(page.getByText("Yükleniyor…")).toHaveCount(0);
}

/**
 * Sayfa gerçekten biçimlendi mi? Ekran görüntüsü betiğindeki `assertStyled`
 * ile aynı ölçüt: ham HTML `{sheets: 0, margin: "8px"}` veriyor (sunucu
 * ayaktayken `next build` `.next`i ezince olan şey).
 */
export async function bicimliOlmali(page: Page): Promise<void> {
  const durum = await page.evaluate(() => ({
    sheets: document.styleSheets.length,
    margin: getComputedStyle(document.body).marginTop,
  }));
  expect(durum, "sayfa biçimsiz geldi").toEqual({
    sheets: expect.any(Number),
    margin: "0px",
  });
  expect(durum.sheets).toBeGreaterThan(0);
}

/**
 * Ekranda hata satırı (`ErrorLine`, role=alert) kalmamalı.
 *
 * Next.js'in rota duyurucusu da `role="alert"` taşıyor (ekran okuyucuya
 * "sayfa değişti" diyen gizli öğe); o sayılmıyor.
 */
export async function hataSatiriOlmamali(page: Page): Promise<void> {
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toHaveCount(0);
}
