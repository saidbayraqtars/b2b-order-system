import { loadTenant } from "@repo/services";

// ⚠ **Yalnızca sunucu.** `@repo/services` nodemailer ve `fs` taşıyor; bu dosyayı
// bir `"use client"` modülünden içe aktarmak ikisini de tarayıcı paketine
// sokar ve derleme "Can't resolve 'fs'" ile düşer. Tam olarak bu oldu:
// `auth-shell` hem sunucu kabuğunu hem küçük bir istemci yardımcısını
// (`Stagger`) dışa veriyordu, yardımcı da dört formdan içe aktarılıyordu.
// Yardımcı kendi dosyasına taşındı (`components/stagger.tsx`).

// Kabuğun sol üstünde ve giriş ekranında yazan ad.
//
// `SidebarShell` bu adı sabit "B2B Portal" olarak taşıyordu; her müşteri kendi
// kurulumunu çalıştırdığı için orada kendi ticari unvanının yazması gerekiyor.
// Kaynak kiracı klasörü (`tenants/<slug>/tenant.json`), yani dağıtımın kendi
// özelliği — bir veritabanı satırı değil.

/** Kiracı klasörü yoksa yazılan ad. */
export const FALLBACK_BRAND = "B2B Portal";

/**
 * Kiracının görünen adı; `tradeName` varsa o, yoksa ticaret unvanı.
 *
 * **Yutulan hata bilerek.** `loadTenant()` klasör yoksa fırlatıyor ve bu doğru:
 * irsaliyenin satıcı künyesi eksikse belge geçersizdir (bkz. `DocumentShell`).
 * Ama kenar çubuğundaki ad bir belge değil bir etiket; kurulumu yarım bir
 * geliştirici makinesinde uygulamanın hiç açılmaması, kazandırdığından çok
 * daha fazlasını götürürdü. Eksik kurulumu haykıran yer belgeler, burası değil.
 */
export async function tenantBrand(): Promise<string> {
  try {
    const { seller } = await loadTenant();
    return seller.tradeName?.trim() || seller.legalName;
  } catch {
    return FALLBACK_BRAND;
  }
}
