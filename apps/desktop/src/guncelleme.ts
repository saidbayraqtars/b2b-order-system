import { app, dialog, BrowserWindow } from "electron";
import type { AppUpdater } from "electron-updater";
import { temelYetki, type Ayarlar } from "./ayarlar";

// Kabuğun kendi güncellemesi.
//
// İki ayrı şey güncelleniyor ve karıştırılmamalı:
//
//   • **Arayüz** — sunucudan geliyor. Web'e çıkan bir düzeltme, uygulamayı
//     yeniden başlatmaya bile gerek kalmadan burada da görünür; kabuk sayfayı
//     barındırmıyor, gösteriyor.
//   • **Kabuk** — bu `.exe`. Yalnızca pencere, menü, güncelleme ve sunucu
//     ayarı burada. Ayda bir değişse çok.
//
// Kaynak: **uygulamanın bağlı olduğu sunucu.** Ayrı bir dağıtım kanalı
// kurulmuyor, çünkü o sunucu zaten merkezden güncelleniyor (Adım 50): satıcı
// yeni sürümü yayımlıyor, sunucu kendini güncelliyor, masaüstü de dosyayı o
// sunucudan alıyor. Tek yön, tek kaynak — ve müşterinin makinesi yalnızca
// kendi sunucusuna bağlanıyor, dışarıya değil.

/** Sunucu adresinden electron-updater akış adresi. */
export function akisAdresi(sunucu: string): string {
  return `${sunucu.replace(/\/+$/, "")}/api/masaustu`;
}

let kurulacak = false;

export function guncellemeyiKur(
  updater: AppUpdater,
  ayarlar: Ayarlar,
  pencere: () => BrowserWindow | null,
): void {
  if (!app.isPackaged) return; // Geliştirmede güncelleme yok: paket imzası yok.
  if (!ayarlar.sunucu) return;

  const otomatik = ayarlar.otomatikGuncelle;
  updater.setFeedURL({ provider: "generic", url: akisAdresi(ayarlar.sunucu) });

  // Sunucunun önünde parola kapısı varsa güncelleyici de ondan geçmek zorunda.
  // Pencerenin `login` olayı burayı kapsamıyor: indirmeyi Electron'un ağ yığını
  // değil, güncelleyicinin kendi isteği yapıyor.
  const yetki = temelYetki(ayarlar);
  if (yetki) updater.requestHeaders = { authorization: yetki };

  // Fark (delta) indirmesi kapalı: sunucu dosyaları düz servis ediyor ve
  // aralık (Range) isteklerini desteklemeyebilir. Kapatılmazsa güncelleyici
  // yarım indirdiği dosyayı bozuk sayıp döngüye giriyor.
  updater.disableDifferentialDownload = true;
  updater.autoDownload = true;
  // Kurulum **çıkışta**: kullanıcı sipariş girerken kendiliğinden yeniden
  // başlayan bir uygulama, kaybedilmiş bir form demek.
  updater.autoInstallOnAppQuit = otomatik;

  updater.on("update-downloaded", (bilgi) => {
    kurulacak = true;
    const pen = pencere();
    if (!pen) return;
    void dialog
      .showMessageBox(pen, {
        type: "info",
        title: "Güncelleme hazır",
        message: `Yeni sürüm indirildi: ${bilgi.version}`,
        detail: otomatik
          ? "Uygulamayı kapattığınızda kendiliğinden kurulacak. Şimdi kurmak isterseniz aşağıdaki düğmeyi kullanın."
          : "Kurulum için uygulamanın yeniden başlatılması gerekiyor.",
        buttons: ["Sonra", "Şimdi kur ve yeniden başlat"],
        defaultId: 0,
        cancelId: 0,
      })
      .then((cevap) => {
        if (cevap.response === 1) updater.quitAndInstall();
      });
  });

  // Hata **sessiz**: sunucuya ulaşılamaması olağan (kapalı, ağ yok, henüz
  // sürüm yayımlanmamış) ve her açılışta hata kutusu çıkaran bir uygulama,
  // kullanıcının güncellemeyi kapattığı uygulamadır. Menüden elle denetlenince
  // sonuç gösteriliyor (bkz. `eldenDenetle`).
  updater.on("error", () => undefined);
}

/** Menüden "Güncellemeleri denetle" — burada sessizlik kabalık olur. */
export async function eldenDenetle(
  updater: AppUpdater,
  pencere: BrowserWindow | null,
): Promise<void> {
  if (!app.isPackaged) {
    if (pencere) {
      await dialog.showMessageBox(pencere, {
        type: "info",
        title: "Güncelleme",
        message: "Geliştirme sürümünde güncelleme denetimi yapılmıyor.",
      });
    }
    return;
  }

  try {
    const sonuc = await updater.checkForUpdates();
    if (!pencere) return;
    if (kurulacak) {
      await dialog.showMessageBox(pencere, {
        type: "info",
        title: "Güncelleme",
        message: "Yeni sürüm zaten indirildi; uygulamayı kapatınca kurulacak.",
      });
      return;
    }
    const yeni = sonuc && sonuc.updateInfo && sonuc.updateInfo.version !== app.getVersion();
    await dialog.showMessageBox(pencere, {
      type: "info",
      title: "Güncelleme",
      message: yeni
        ? `Yeni sürüm indiriliyor: ${sonuc!.updateInfo.version}`
        : `En güncel sürümü kullanıyorsunuz (${app.getVersion()}).`,
    });
  } catch (hata) {
    if (!pencere) return;
    await dialog.showMessageBox(pencere, {
      type: "warning",
      title: "Güncelleme denetlenemedi",
      message: "Sunucuya ulaşılamadı ya da yayımlanmış bir sürüm yok.",
      detail: hata instanceof Error ? hata.message : String(hata),
    });
  }
}
