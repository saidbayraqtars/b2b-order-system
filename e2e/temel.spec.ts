import { expect, test } from "@playwright/test";
import {
  bicimliOlmali,
  hatalariTopla,
  oturum,
  yerlesmesiniBekle,
  type Hesap,
} from "./yardimci";

// Rol başına giriş noktaları ve yetki yönlendirmeleri — `scripts/e2e.mjs`ten
// taşındı. Kayıt defteri testi (ekranlar.spec) "ekran ayakta mı" diye soruyor;
// bu dosya "her rol doğru yere mi iniyor, kapı gerçek tarayıcıda da kapalı mı".
//
// Beklenen bir metin, seçici değil: sınıf adı tasarım değişince kırılır ve o
// kırılma bir şey öğretmez; başlık değişince kırılan test gerçekten bir şeyin
// değiştiğini söyler.

const GIRISLER: Array<{ as: Hesap | "anon"; path: string; expect: string }> = [
  { as: "anon", path: "/login", expect: "Portala giriş yapın" },
  { as: "anon", path: "/kayit", expect: "Bayi olmak için başvurun" },
  { as: "anon", path: "/", expect: "Giriş yap" },

  { as: "admin", path: "/admin", expect: "Panel" },
  { as: "admin", path: "/admin/siparisler", expect: "Siparişler" },
  { as: "admin", path: "/admin/products", expect: "Ürünler" },
  { as: "admin", path: "/admin/companies", expect: "Firmalar" },
  { as: "admin", path: "/admin/kasa", expect: "Kasa" },
  { as: "admin", path: "/admin/stok?bolum=durum", expect: "Stok defteri" },
  { as: "admin", path: "/admin/analitik?bolum=durum", expect: "Yönetici panosu" },
  { as: "admin", path: "/admin/toplu-guncelleme", expect: "Toplu güncelleme" },
  { as: "admin", path: "/reports", expect: "Raporlarım" },
  { as: "admin", path: "/hesabim", expect: "Hesabım" },

  { as: "portal", path: "/portal/orders", expect: "Siparişler" },
  { as: "portal", path: "/portal/statement", expect: "Ekstre" },

  { as: "rep", path: "/rep", expect: "Portföy" },
  { as: "rep", path: "/rep/ziyaret", expect: "ziyaret" },
  { as: "courier", path: "/kurye", expect: "Teslim" },
];

/**
 * Kullanıcının **nerede bittiği**. Sayfa testleri `redirect()`in fırlattığı
 * hatayı okuyor; ara katman, kabuk ve istemci yönlendirmesi araya girebilir.
 */
const YONLENDIRMELER: Array<{ as: Hesap | "anon"; path: string; endsAt: string }> = [
  { as: "portal", path: "/admin", endsAt: "/portal" },
  { as: "rep", path: "/admin/kasa", endsAt: "/rep" },
  { as: "courier", path: "/admin", endsAt: "/kurye" },
  { as: "anon", path: "/admin", endsAt: "/login" },
];

for (const hesap of ["anon", "admin", "portal", "rep", "courier"] as const) {
  test.describe(`${hesap}`, () => {
    if (hesap !== "anon") test.use({ storageState: oturum(hesap) });

    for (const g of GIRISLER.filter((x) => x.as === hesap)) {
      test(`${g.path} açılır`, async ({ page }) => {
        const hatalar = hatalariTopla(page);
        await page.goto(g.path);
        await bicimliOlmali(page);
        await yerlesmesiniBekle(page);
        await expect(page.locator("body")).toContainText(g.expect);
        expect(hatalar).toEqual([]);
      });
    }

    for (const y of YONLENDIRMELER.filter((x) => x.as === hesap)) {
      test(`${y.path} → ${y.endsAt}`, async ({ page }) => {
        await page.goto(y.path);
        await expect(page).toHaveURL((url) => url.pathname === y.endsAt);
      });
    }
  });
}
