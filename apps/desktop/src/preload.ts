import { contextBridge, ipcRenderer } from "electron";

// Kurulum ve hata ekranlarının köprüsü.
//
// Kasten dar: dört çağrı, hepsi ana sürece gidiyor ve hiçbiri dosya sistemine
// ya da Node'a doğrudan erişim vermiyor. Ana pencere (uzak arayüz) bu
// preload'u **hiç yüklemiyor** — sunucudan gelen bir sayfaya, ne kadar
// güvenilse de, ayar yazma yetkisi verilmez.

contextBridge.exposeInMainWorld("kabuk", {
  ayarlariOku: () => ipcRenderer.invoke("ayar:oku"),
  dene: (sunucu: string) => ipcRenderer.invoke("ayar:dene", sunucu),
  kaydet: (veri: { sunucu: string; otomatikGuncelle: boolean }) =>
    ipcRenderer.invoke("ayar:kaydet", veri),
  yenidenDene: () => ipcRenderer.invoke("kabuk:yeniden-dene"),
  kurulumAc: () => ipcRenderer.invoke("kabuk:kurulum-ac"),
});
