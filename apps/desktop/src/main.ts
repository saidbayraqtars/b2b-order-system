import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { autoUpdater } from "electron-updater";
import { join } from "node:path";
import {
  ayarlariOku,
  ayarlariYaz,
  normalizeAdres,
  temelYetki,
  type Ayarlar,
} from "./ayarlar";
import { eldenDenetle, guncellemeyiKur } from "./guncelleme";

// B2B masaüstü kabuğu.
//
// Ne yapıyor: sunucudaki arayüzü kendi penceresinde açıyor. Ne yapmıyor: o
// arayüzün bir kopyasını taşımıyor. Karar bu tek cümlede — **arayüz sunucudan
// geliyor**, yani web'e çıkan bir düzeltme aynı anda masaüstünde de var ve
// kullanıcının bir şey indirmesi gerekmiyor. Kabuk yalnızca kabuk: pencere,
// menü, sunucu adresi, güncelleme.
//
// Neden tarayıcı değil de uygulama: müşteri "programı" istiyor. Görev
// çubuğunda kendi simgesi, adres çubuğu olmayan bir pencere, çift tıkla açılma
// ve kendi kendini güncelleme — tarayıcı sekmesinin vermediği şeyler bunlar.
//
// Güvenlik: pencere uzak içerik yüklüyor, bu yüzden `nodeIntegration` kapalı,
// `contextIsolation` açık ve ana pencerede **preload yok**. Kurulum ekranı
// (yerel HTML) dar bir köprüyle ayarları yazabiliyor, o kadar.

let anaPencere: BrowserWindow | null = null;
let kurulumPenceresi: BrowserWindow | null = null;
let ayarlar: Ayarlar = { sunucu: "", otomatikGuncelle: true, kullanici: "", parola: "" };

const KURULUM_HTML = join(__dirname, "..", "arayuz", "kurulum.html");
const HATA_HTML = join(__dirname, "..", "arayuz", "hata.html");
const PRELOAD = join(__dirname, "preload.js");

// Tek örnek: ikinci çift tık yeni pencere açmasın, açığı öne getirsin.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const pen = anaPencere ?? kurulumPenceresi;
    if (pen) {
      if (pen.isMinimized()) pen.restore();
      pen.focus();
    }
  });
}

/**
 * Sunucunun önündeki parola kapısını yanıtla.
 *
 * Tarayıcı 401 görünce kullanıcıya bir kutu açıyor; Electron açmıyor ve olayı
 * dinleyen yoksa istek sessizce düşüyor. Kapının arkasındaki bir sunucuya
 * uygulamadan **tek istek** ulaşmamıştı; bu dinleyici o boşluğu kapatıyor.
 *
 * Vekil (proxy) kimliği bu değil: onu yanıtlamak, kuruluşun ağ vekiline
 * sunucu parolasını göndermek olurdu.
 */
app.on("login", (olay, _icerik, istek, kimlikBilgisi, geriCagir) => {
  if (kimlikBilgisi.isProxy) return;
  if (!ayarlar.kullanici && !ayarlar.parola) return;
  if (ayarlar.sunucu && !istek.url.startsWith(ayarlar.sunucu)) return;
  olay.preventDefault();
  geriCagir(ayarlar.kullanici, ayarlar.parola);
});

function kurulumAc(): void {
  if (kurulumPenceresi) {
    kurulumPenceresi.focus();
    return;
  }
  kurulumPenceresi = new BrowserWindow({
    width: 560,
    height: 620,
    resizable: false,
    title: "B2B — sunucu adresi",
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  void kurulumPenceresi.loadFile(KURULUM_HTML);
  kurulumPenceresi.on("closed", () => {
    kurulumPenceresi = null;
    // Adres hâlâ yoksa gösterecek bir şey yok; uygulama kapanıyor.
    if (!ayarlar.sunucu && !anaPencere) app.quit();
  });
}

function anaPencereAc(): void {
  anaPencere = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    title: "B2B",
    backgroundColor: "#f6f6f5",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Uzak arayüz kendi oturum çerezini kullanıyor; kalıcı oturum
      // (`persist:`) olmadan her açılışta yeniden giriş istenirdi.
      partition: "persist:b2b",
    },
  });

  anaPencere.once("ready-to-show", () => anaPencere?.show());
  void anaPencere.loadURL(ayarlar.sunucu);

  anaPencere.webContents.on("did-fail-load", (_o, kod, aciklama, adres, anaCerceve) => {
    // Yalnızca ana çerçevenin düşmesi ekranı boş bırakıyor; bir resmin
    // yüklenememesi hata sayfası açmayı hak etmiyor.
    if (!anaCerceve) return;
    if (kod === -3) return; // İptal edilen gezinme (kullanıcı hızlı tıkladı).
    const q = new URLSearchParams({ sunucu: ayarlar.sunucu, kod: String(kod), mesaj: aciklama, adres });
    void anaPencere?.loadURL(`file://${HATA_HTML.replace(/\\/g, "/")}?${q.toString()}`);
  });

  // Dış bağlantılar sistem tarayıcısında: uygulama penceresinde adres çubuğu
  // yok, ve kullanıcının nereye gittiğini göremediği bir pencerede başka bir
  // siteyi açmak doğru değil.
  anaPencere.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  anaPencere.webContents.on("will-navigate", (olay, url) => {
    if (url.startsWith(ayarlar.sunucu) || url.startsWith("file://")) return;
    olay.preventDefault();
    void shell.openExternal(url);
  });

  anaPencere.on("closed", () => {
    anaPencere = null;
  });
}

function menuKur(): void {
  const sablon: MenuItemConstructorOptions[] = [
    {
      label: "Dosya",
      submenu: [
        {
          label: "Yenile",
          accelerator: "CmdOrCtrl+R",
          click: () => anaPencere?.webContents.reload(),
        },
        {
          label: "Ana ekran",
          click: () => {
            if (anaPencere && ayarlar.sunucu) void anaPencere.loadURL(ayarlar.sunucu);
          },
        },
        { type: "separator" },
        { label: "Sunucu adresi…", click: () => kurulumAc() },
        { type: "separator" },
        { label: "Çıkış", role: "quit" },
      ],
    },
    {
      label: "Görünüm",
      submenu: [
        { label: "Yakınlaştır", role: "zoomIn", accelerator: "CmdOrCtrl+Plus" },
        { label: "Uzaklaştır", role: "zoomOut", accelerator: "CmdOrCtrl+-" },
        { label: "Normal boyut", role: "resetZoom", accelerator: "CmdOrCtrl+0" },
        { type: "separator" },
        { label: "Tam ekran", role: "togglefullscreen" },
      ],
    },
    {
      label: "Yardım",
      submenu: [
        {
          label: "Güncellemeleri denetle",
          click: () => void eldenDenetle(autoUpdater, anaPencere),
        },
        {
          label: `Sürüm ${app.getVersion()}`,
          enabled: false,
        },
        { type: "separator" },
        {
          label: "Geliştirici araçları",
          accelerator: "F12",
          click: () => anaPencere?.webContents.toggleDevTools(),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(sablon));
}

// ── kurulum ekranının köprüsü ───────────────────────────────────────────────

ipcMain.handle("ayar:oku", () => ayarlar);

/**
 * Adresi **denemeden** kaydetmiyoruz.
 *
 * Yanlış yazılmış bir adres, uygulamayı bir daha açılmayan bir pencereye
 * çeviriyor ve kullanıcı hatayı ancak boş ekranda görüyor. Sağlık ucu
 * (`/api/health`) burada tam da bunun için var: cevap veriyorsa adres doğru,
 * vermiyorsa sebebi kurulum ekranında yazıyor.
 */
ipcMain.handle(
  "ayar:dene",
  async (_o, gelen: { sunucu: string; kullanici?: string; parola?: string }) => {
    const adres = normalizeAdres(gelen.sunucu);
    if (!adres) return { ok: false, mesaj: "Adres boş." };
    const yetki = temelYetki({
      kullanici: gelen.kullanici ?? "",
      parola: gelen.parola ?? "",
    });
    try {
      const cevap = await fetch(`${adres}/api/health`, {
        redirect: "follow",
        headers: yetki ? { authorization: yetki } : undefined,
        signal: AbortSignal.timeout(8000),
      });
      if (cevap.status === 401) {
        // Kapı var: ekran bunu görünce kullanıcı adı/parola alanlarını açıyor.
        return {
          ok: false,
          parolaGerekli: true,
          mesaj: yetki
            ? "Kullanıcı adı ya da parola yanlış."
            : "Bu adres parola istiyor.",
        };
      }
      if (!cevap.ok && cevap.status !== 503) {
        return { ok: false, mesaj: `Sunucu ${cevap.status} döndü.` };
      }
      const veri = (await cevap.json()) as { status?: string };
      if (veri.status === "ok") return { ok: true, adres, mesaj: "Bağlantı kuruldu." };
      // 503 + "error": sunucu ayakta ama kendini sağlıksız buluyor. Adres
      // doğru; kullanıcıyı geri çevirmek yerine uyarıp geçiriyoruz.
      return {
        ok: true,
        adres,
        mesaj: "Sunucu yanıt veriyor ama sağlık kontrolü uyarı veriyor.",
      };
    } catch (hata) {
      return {
        ok: false,
        mesaj: hata instanceof Error ? `Ulaşılamadı: ${hata.message}` : "Ulaşılamadı.",
      };
    }
  },
);

ipcMain.handle(
  "ayar:kaydet",
  (
    _o,
    gelen: {
      sunucu: string;
      otomatikGuncelle: boolean;
      kullanici?: string;
      parola?: string;
    },
  ) => {
    const adres = normalizeAdres(gelen.sunucu);
    if (!adres) return { ok: false };

    ayarlar = {
      sunucu: adres,
      otomatikGuncelle: gelen.otomatikGuncelle !== false,
      kullanici: gelen.kullanici ?? "",
      parola: gelen.parola ?? "",
    };
    ayarlariYaz(ayarlar);
    guncellemeyiKur(autoUpdater, ayarlar, () => anaPencere);

    if (anaPencere) void anaPencere.loadURL(ayarlar.sunucu);
    else anaPencereAc();

    kurulumPenceresi?.close();
    return { ok: true };
  },
);

ipcMain.handle("kabuk:yeniden-dene", () => {
  if (anaPencere && ayarlar.sunucu) void anaPencere.loadURL(ayarlar.sunucu);
});

ipcMain.handle("kabuk:kurulum-ac", () => kurulumAc());

// ── açılış ──────────────────────────────────────────────────────────────────

void app.whenReady().then(() => {
  ayarlar = ayarlariOku();
  menuKur();

  if (!ayarlar.sunucu) {
    kurulumAc();
    return;
  }

  anaPencereAc();
  guncellemeyiKur(autoUpdater, ayarlar, () => anaPencere);

  // Açılışta hemen değil: ilk saniyeler pencerenin çizilmesine ait. Sonra
  // altı saatte bir — uygulamayı günlerce açık bırakan kullanıcı için.
  setTimeout(() => {
    if (app.isPackaged) void autoUpdater.checkForUpdates().catch(() => undefined);
  }, 15_000);
  setInterval(() => {
    if (app.isPackaged) void autoUpdater.checkForUpdates().catch(() => undefined);
  }, 6 * 60 * 60 * 1000);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (ayarlar.sunucu) anaPencereAc();
    else kurulumAc();
  }
});

// Beklenmedik hata pencereyi sessizce öldürmesin.
process.on("uncaughtException", (hata) => {
  dialog.showErrorBox("Beklenmeyen hata", hata.stack ?? String(hata));
});
