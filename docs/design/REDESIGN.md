# Arayüz Yenilemesi — plan ve ilerleme

Bu dosya hem yol haritası hem de sohbetler arası devir teslim notudur. Yeni bir
sohbet açtığınızda önce burayı okutun: nerede kalındığı, hangi kararların
verildiği ve sıradaki adımın ne olduğu burada yazılı.

## Tasarım kaynağı

Google Stitch projesi **"Dual-Portal Corporate Dashboard"** (ID
`10805844652839299989`). İndirilmiş ekran görüntüleri ve HTML'leri:
`docs/design/stitch-v2/`

| Dosya            | Ekran                             |
| ---------------- | --------------------------------- |
| `1-temsilci`     | Temsilcilik bilgileri / cari özet |
| `2-sepet`        | Sepet + sipariş özeti             |
| `3-siparisler`   | Sipariş listesi (tablo)           |
| `4-musteri-ozet` | Müşteri listesi + sayı kutuları   |
| `5-katalog`      | Ürün kataloğu (kart ızgarası)     |
| `6-analitik`     | Analitik panosu                   |

Stitch MCP sunucusu Claude Code'un araç şemasını çözemiyor
(`can't resolve reference #/$defs/ScreenInstance`), bu yüzden çağrılar `curl`
ile yapıldı:

```bash
curl -s -X POST https://stitch.googleapis.com/mcp \
  -H "X-Goog-Api-Key: $STITCH_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"get_screen",
                 "arguments":{"projectId":"10805844652839299989",
                              "screenId":"<id>"}}}'
```

`get_screen` çağrısında `name` alanı yerine `projectId` + `screenId` verin;
`name` biçimi bazı ekranlarda "invalid argument" dönüyor.

## Tasarım dili — "Executive Precision"

Beş kural. Yeni yazılan her ekran bunlara uyar:

1. **Tek renk ailesi var, o da gri.** Renk süs değil işaret: yeşil "stokta",
   kehribar "sınırlı", kırmızı "borç/iptal", siyah "birincil eylem". Eski indigo
   marka rengi kaldırıldı — `brand-600` artık mürekkep siyahı.
2. **Yüzeyler gölgeyle değil 1px çizgiyle ayrılır.** `shadow-card` bilerek
   `none`. Gölge yalnızca gerçekten üstte duran şeyde (pencere, açılır menü).
3. **Köşeler sıkı.** Kart 6px, düğme/girdi 4px, künye 4px. Yuvarlak hatlar
   "uygulama" hissi veriyordu; burada belge hissi isteniyor.
4. **Tek yazı tipi: Inter.** Başlık için ayrı aile yok — hiyerarşi ağırlık ve
   harf aralığıyla kuruluyor. Ölçen sayılar `tabular-nums`.
5. **Tek kabuk.** Solda 256px sabit gezinme, üstte 64px ince şerit. Yönetim,
   portal, plasiyer ve kurye aynı yerleşimi paylaşır.

### Renk değerleri

Anlamsal isimler CSS değişkeninden okunur (`src/app/globals.css`), koyu temada
kendiliğinden döner. **Yeni kodda `dark:` yazmayın**, anlamsal ismi kullanın:

| Sınıf                                      | Ne için                      | Açık                              | Koyu                              |
| ------------------------------------------ | ---------------------------- | --------------------------------- | --------------------------------- |
| `bg-surface`                               | sayfa zemini                 | `#f9f9fb`                         | `#0f1112`                         |
| `bg-panel`                                 | kart, tablo, kutu            | `#ffffff`                         | `#191c1e`                         |
| `bg-sunken`                                | girdi, görsel kutusu, th     | `#f3f3f6`                         | `#232627`                         |
| `bg-subtle`                                | üzerine gelince, vurgusuz    | `#edeef0`                         | `#2a2d2e`                         |
| `border-line` / `border-line-strong`       | kenar / ayraç                | `#dcdee0` / `#c5c6ca`             | `#2e3132` / `#44474a`             |
| `text-ink` / `-muted` / `-faint`           | ana / ikincil / etiket metni | `#191c1e` / `#44474a` / `#75777a` | `#e5e7e8` / `#a9adae` / `#7d8283` |
| `bg-accent` `text-on-accent`               | birincil eylem, seçili öğe   | `#1a1c1e` / beyaz                 | beyaz / `#101314`                 |
| `text-positive` / `-caution` / `-critical` | durum renkleri               | —                                 | —                                 |

### Yazı ölçeği (`text-*`)

`display` 40, `headline-lg` 32, `headline-md` 24, `headline-sm` 18,
`body-lg` 18, `body-md` 16, `body-sm` 14, `label` 12/600/0.05em büyük harf.

Sayfa başlığı `headline-lg`, panel başlığı `headline-sm`, gövde `body-sm`.

## Paylaşılan bileşenler

`src/components/ui.tsx`
: `Card`, `StatTile`, `Meter`, `Field`, `DefRow`, `Badge`, `PageHeader`, `Note`,
`LoadingState`, `EmptyState`, `Tabs`, `Chips`, `MultiChips`,
`Table`/`THead`/`TBody`/`Th`/`Td`/`TableEmpty`

`src/components/form.tsx`
: `Label`, `TextInput`, `Select`, `MultiSelect`, `TextArea`, `Checkbox`,
`Button`, `LinkButton`, `Panel`, `Modal`, `ErrorLine`, `WarnLine`

İstemciye özel üçlü (kanca taşıdıkları için `ui.tsx`e konamadılar; orası sunucu
bileşenlerinden de içe aktarılıyor):
`table-sort.tsx` (`useTableSort`, `SortableTh`) · `toast.tsx` (`ToastProvider`,
`useToast`) · `show-more.tsx` (`useVisibleSlice`, `ShowMore`)

`src/components/app-sidebar.tsx`
: `SidebarShell` — uygulamanın tek kabuğu. `groups` (başlıksız grup = düz
liste), `search` (üst şeritteki arama kutusu), `actions` (sağdaki düğmeler).

**Sayfa boşluğu kabuktan geliyor** (`px-4 py-6 md:px-10 md:py-8`). Ekranlar
kendi `px-4 py-6`sını yazmaz; yalnızca `mx-auto max-w-*` ile genişlik seçer.

---

## Ekran görüntüsü kuralı

Bir adım bittiğinde o adımın ekranları `docs/design/screens/adim-<n>/` altına
çekilir. Elle değil: ekranı `scripts/screens.mjs` kayıt defterine bir satır
olarak ekleyip `pnpm shots --step <n>` çalıştırın. Ayrıntı ve kararlar
`docs/design/screens/README.md`de.

Neden: "tokenlara taşındı" cümlesi bir ekranın doğru göründüğünü söylemiyor.
İlk çekimde çıkan iki hata bunu kanıtladı — siyah düğmenin üstüne siyah yazı
(`tailwind-merge` `text-body-sm`i punto değil renk sanıyordu) ve bazı
rotalarda kabuğun düşmesi (sunucu bileşeni lucide ikonlarını istemci
bileşenine geçiriyordu). İkisi de derlemeden, testlerden ve `tsc`den geçmişti.

**Çekimden sonra dosyanın boyuna bakın.** Adım 4, 5 ve 6'da aynı hata üç kez
çıktı: uzun bir liste sayfayı 6000 piksel sınırının ötesine taşıyor ve altındaki
dipnot, sayfalama düğmesi ya da panel hiç görünmüyor. Ekran görüntüsü hata
vermez — sadece kırpar. Bir PNG 3000 pikselden uzunsa o ekranda sınırlanmamış
bir liste var demektir.

## İlerleme

### ✔ Adım 1 — Temel katman ve kabuk (bitti)

- `tailwind.config.ts`: yeni token seti. `neutral` ve `brand` merdivenleri
  yerinde bırakılıp **değerleri** değiştirildi — elden geçmemiş 1000+ satır
  dokunulmadan yeni tona geçti. Köşe yarıçapları sıkıldı, yazı ölçeği eklendi,
  `shadow-card` sıfırlandı.
- `src/app/globals.css`: anlamsal CSS değişkenleri + `.dark` karşılıkları,
  odak halkası nötrleştirildi, `tech-paper` deseni kaldırıldı.
- `layout.tsx`: Plus Jakarta Sans kaldırıldı (tek aile Inter).
- `ui.tsx` / `form.tsx`: hepsi anlamsal tokenlara taşındı; `StatTile` ve `Chips`
  eklendi, `Panel` ikon aldı, tablo başlığı gömük zemine oturdu.
- **Üç kabuk teke indi.** `AppHeader` (üst bar) ve kullanılmayan `AdminNav`
  silindi; `PortalNav`, `RepNav` ve kurye ekranı `SidebarShell` sarmalayıcısına
  dönüştü. Çağrı yerleri artık `<PortalNav …>{içerik}</PortalNav>` biçiminde.
- Sayfa gutter'ları kabuğa taşındı (45 dosya).

Doğrulama: `tsc --noEmit` temiz, `vitest run` 218/218 geçti, `next build` başarılı.

### ✔ Adım 2 — Portal / vitrin (bitti)

Öncelik müşterinin aradığını bulmasıydı; sıra da ona göre kuruldu.

- **Arama üst şeride taşındı.** `SidebarShell`'in `search` yuvası artık dar
  ekranda da çiziliyor: arama kutusu varsa sayfa başlığı mobilde çekiliyor —
  ikisi 64 pikselde yan yana sığmıyor ve arama, sayfanın adından daha çok işe
  yarıyor. Okutma bildirimi kutunun **altına, akışın dışına** konumlanıyor;
  satır açsaydı şeridi ve sepet sayacını yerinden oynatırdı.
- **Ürün kartı Stitch `5-katalog` düzenine geçti**: kare `bg-sunken` kutu +
  `object-contain` (toptan katalogda fotoğraflar farklı oranlarda geliyor,
  kırpmak etiketi kesiyordu), sol üstte kategori künyesi, `KOD: <sku>`, ad,
  stok noktası, fiyat + sepet düğmesi.
  - **Üç varyant satırı karttan kalktı.** Sebep kalabalık değil yanlış vaat:
    üç satır gösterip dördüncüyü "+2 varyant daha" diye saklamak, ızgarayı
    tarayan kişiye kartın tam künye olduğunu düşündürüyordu. Tek varyantlı
    ürün — katalogun büyük çoğunluğu — karttan doğrudan sepete girer; çok
    varyantlı ürünün sepet düğmesi detaya götürür, çünkü hangi varyantın
    istendiği kartta cevaplanamaz.
  - Stok işaretinin sınırı koli büyüklüğüne bağlı (`5 × unitsPerCase`):
    toptancı için "az kaldı" mutlak bir adet değil, birkaç koli demek.
  - Kategori adı `categoryId`den ekranda çözülüyor (kenar çubuğunun zaten
    indirdiği ağaçtan) — katalog cevabına ikinci bir alan eklemek aynı adı her
    satırda tekrar indirmek olurdu.
- **Sepet iki kutuya ayrıldı**: üstte kalem listesi, altında Stitch `2-sepet`
  yerleşimindeki "Sipariş Özeti" (ödeme yöntemi / vade / kupon → ara toplam,
  iskonto, KDV, genel toplam). Kenar sütunu 300→320 piksel. Ayrı bir `/sepet`
  rotası **açılmadı**: sepet sayfa düzeni motorunda `CART_PANEL` bloğu, yeni
  rota onu yerinden ederdi.
- **Sipariş listesi** `Table` + `Badge` künyeleriyle zaten çiziliyordu; kalan
  ham kabuk, toplu basım şeridi ve yazdırma ikonu anlamsal tokenlara geçti.
- **Ekstre** `StatTile` + `Panel` + `Table`e taşındı; ham indigo "CSV indir"
  düğmesi `Button`, yazdırma bağlantısı `LinkButton` oldu.
- **Ziyaret, onaylar, kullanıcılar, firma seçimi** `PageHeader` + paylaşılan
  form bileşenlerine geçti. `ErrorLine` artık düz metin de kabul ediyor —
  ziyaret ekranı hatayı `string` olarak tutuyor ve bileşen onu "Beklenmeyen bir
  hata" diye yutuyordu.
- Vitrin yardımcıları da elden geçti: `ActingAsBar` (kendi `max-w`si kaldırıldı,
  kabuğun dolgusuna oturdu), `Announcements` (bant/şerit/pencere),
  `CompanySwitcher`, `CompanyPicker`, ürün detayı.

Doğrulama: `tsc --noEmit` temiz, `next lint` temiz, `vitest run` 218/218 geçti,
`next build` başarılı.

### ✔ Adım 3 — Yönetim çekirdeği (bitti)

- **Pano yeniden kuruldu.** Üstte dört `StatTile` (ciro, sipariş, onay
  bekleyen, iptal/red), altında iki `Panel`. Sayılar `getSalesSummary()`den
  geliyor — panonun kendi sorgusu yok, rapor ekranıyla aynı pencereyi (son 30
  gün) ve aynı "ciro nedir" tanımını okuyor.
  - Kutular **`reports.view`**e bağlı, sipariş iznine değil: ciro, sipariş
    listesinden ayrı bir bilgi ve listeyi görebilen herkesin görmesi
    gerekmiyor.
  - `OrdersBoard` bir `framed` bayrağı aldı. Panonun `Panel`i zaten çerçeve
    çiziyor ve tablo da kendininkini çizince iki kenar çizgisi üst üste
    biniyordu; portal ve onay ekranlarındaki çağrılar varsayılan `true` ile
    olduğu gibi kaldı.
- **Firmalar**: liste `Table`/`Badge`e geçti (pasif künyesi artık parantez içi
  metin değil), sayfa başlığı `PageHeader` + `LinkButton` oldu. Firma detayının
  üç satırlık künye paragrafı dört `StatTile`a bölündü — bakiye, limit,
  kullanılabilir, hacim iskontosu. Kalan `px-4 py-6` gutter'ı da kaldırıldı
  (Adım 1'de kabuğa taşınmıştı, bu dosya atlanmış).
- **Ürünler**: "Yeni ürün" düğmesi tablodan sayfa başlığına çıktı — üç ekranda
  (firmalar, ürünler, yeni kayıt) birincil eylem artık aynı yerde. Fiyatsız
  varyant uyarısı `⚠` karakterinden `AlertTriangle` ikonuna geçti; künye değil
  ikon, çünkü bu bir durum değil bir uyarı. Ürün detayının başlığı sunucuda
  okunuyor (`prisma.product.findUnique`, yalnızca ad/marka/aktiflik) — düzenleyici
  ürünün tamamını kendi çekiyor ama başlık ilk boyamada doğru yazsın diye.
- **Sipariş detayı**: sayfadaki ham "← Geri" bağlantısı kalktı; rota
  `defaultRouteForRole` ile sunucudan `PageHeader`ın `back` yuvasına geçiyor
  (o modülü istemciye taşımanın karşılığı yok). Kalem tablosu, özet kartları,
  durum geçmişi ve üç panel (sevkiyat/fatura, ERP, iade) anlamsal tokenlara
  taşındı.

Ekran görüntüsü çekerken çıkan, üç doğrulamanın da yakalamadığı iki hata:

- **Siyah düğmenin üstünde siyah yazı.** `cn()` içindeki `tailwind-merge`,
  tanımadığı her `text-*` sınıfını renk sayıyor; `text-body-sm` bizde punto ama
  merge onu renk sanıp aynı gruptaki `text-on-accent`i eziyordu. `Button`ın
  `md` boyu etiketini kaybetti, `sm` boyu (`text-xs`, tanınan bir punto)
  kaybetmedi — hata bu yüzden aylarca gözden kaçtı. Çözüm: `utils.ts` içinde
  `extendTailwindMerge` ile ölçeğin adlarını `font-size` grubuna tanıtmak.
  **`tailwind.config.ts`teki `fontSize`a yeni bir punto eklerseniz oraya da
  ekleyin.**
- **Bazı rotalarda kabuk düşüyordu.** `portal-nav`, `rep-nav` ve `kurye`
  sunucu bileşeniydi ve link listesindeki lucide ikonlarını istemci olan
  `SidebarShell`e geçiriyordu; lucide `"use client"` taşımıyor, React de
  bileşeni serileştiremiyor ("Functions cannot be passed directly to Client
  Components"). Adım 1'de `admin-shell` istemciye alınmış, diğer üçü atlanmıştı.
  İkisine direktif eklendi, kurye için `CourierShell` ayrıldı.

Pano panelinin başlığı "Tüm firmalar →" derken altında 31 firmanın hepsini
listeliyordu; cari önizlemesi 8 satıra indi (sipariş tablosu sınırsız kaldı —
yönetimde ayrı bir sipariş listesi ekranı yok, pano o listenin kendisi).

Sayaçlar: `dark:` 348 → **237**, `neutral-` 792 → **434**, `brand-` 46 → **20**.

Doğrulama: `tsc --noEmit` temiz, `next lint` temiz, `vitest run` 218/218 geçti,
`next build` başarılı, 12 ekran görüntüsü `docs/design/screens/` altında.

**Açık kalan:** `orders/[id]` hiçbir kabuğun içinde değil — sayfa kenar
çubuksuz açılıyor ve bu, tasarım dilinin 5. kuralını ("tek kabuk") çiğneyen tek
ekran. Adım 3'ten önce de böyleydi. Düzeltmek rolü kabukla eşlemeyi gerektiriyor
(süper admin → `AdminShell`, plasiyer → `RepNav`, alıcı → `PortalNav` + firma
bağlamı); ayrı bir karar olduğu için buraya not düşüldü.

### ✔ Adım 8 — Giriş, kayıt ve şifre (sıradan atlandı, bitti)

Sıradaki adım 4'tü; giriş ekranı öne alındı çünkü kurulumun ilk gördüğü ekran
o ve tasarım dili değişeli beri eski indigo künyeyle duruyordu.

**Ortak kabuk.** `src/components/auth-shell.tsx` — solda sahne, sağda form.
`SidebarShell` burada kullanılamaz: kenar çubuğu bir gezinme aracı ve gezinecek
yeri olmayan ziyaretçiye boş bir menü göstermek anlamsız. Ama kural aynı kaldı,
dört ekran (`/login`, `/kayit`, `/sifremi-unuttum`, `/sifremi-unuttum/yenile`)
tek kabuktan çiziliyor. Öncesinde ikisi ayrı ayrı yazılmıştı: biri `max-w-sm`
ortalanmış bir kutu, diğeri sola dayalı bir sütun.

**Sahne** (`auth-stage.tsx`): kayan teknik çizim ızgarası, kendini çizen
izometrik koli yığını, depodan bayilere akan paketler, ters yönde dönen iki
ölçek halkası, üstten geçen tarama ve sahneyle aynı sayaçtan beslenen üç
adımlık liste. Tasarım dilinin dışına çıkılmadı — tek renk ailesi gri, hareket
eden her şey ya bir çizgi ya bir nokta; hiçbir yerde degrade bir marka rengi
yok. Anlattığı şey de gerçek: depodan çıkan mal, yoldaki sipariş, ucundaki bayi.

- Keyframe'ler `tailwind.config.ts`te (`fade-up`, `draw`, `float`,
  `grid-drift`, `scan`, `ring-pulse`, `caret`, `hairline`, `spin-slow`),
  Tailwind ile yazılamayan iki şey (`auth-grid` deseni, `auth-draw` dasharray)
  `globals.css`te.
- **Kendini çizen çizgide `pathLength="1"`.** Yolun gerçek uzunluğu ne olursa
  olsun ilerleme 0→1 aralığında okunuyor; her parçaya ayrı `dasharray`
  hesaplamak gerekmiyor ve hareket kapatıldığında `animation: none` dashoffset'i
  0'a bırakıyor — yani kapalıyken sahne **eksik değil, hareketsiz**.
- **Akan paketler SMIL** (`animateMotion`), CSS `offset-path` değil: `offset-path`
  Safari'de uzun süre yoktu ve bu, kimsenin tarayıcısını seçemediğimiz tek ekran.
  SMIL'i CSS ile durduramadığınız için `prefers-reduced-motion` açıkken o düğüm
  hiç basılmıyor (`useReducedMotion`).
- **SVG'de `transform-box: fill-box`** olmadan dönüşümün merkezi tuvalin sol üstü
  sayılıyor ve öğe sahneden dışarı fırlıyor — `.auth-origin` bu yüzden var.

**Kayıt = bayilik başvurusu.** `/kayit` bir hesap açmıyor, bir talep gönderiyor.
Gerekçe ticari: burada açılan her müşteri bir caridir, cariye kredi limiti ve
vade tanımlanır, siparişi borç doğurur — kendi kendine açılabilen bir cari,
kimsenin onaylamadığı bir alacaktır. Akış iki belgeye ayrıldı:

1. `DealerApplication` — formun yazdığı satır. Hiçbir yetkisi yok, hiçbir
   ekranı açmaz, kimseyi içeri almaz.
2. Onayda `Company` + `COMPANY_ADMIN` kullanıcı — tek işlemde. Ayrı ayrı
   yazılsaydı araya düşen bir hata, kullanıcısı olmayan bir cari bırakırdı.

- **Şifre üretilmiyor.** Hesap rastgele, kimsenin bilmediği bir özetle açılıyor;
  içeri giren tek yol 48 saatlik tek kullanımlık bağlantı
  (`issueSetPasswordLink`). Postaya yazılmış bir şifre, kutusu yıllarca açık
  duran kalıcı bir anahtardır.
- **Uç kayıtlı adres sızdırmıyor.** Hız sınırına takılan, e-postasıyla zaten
  başvurmuş olan ve zaten hesabı olan — üçü de aynı 202 ve aynı metni alıyor
  (`sifremi-unuttum` ile aynı gerekçe). Sessizce düşen gönderim yine de denetim
  kaydına yazılıyor: sessizlik başvurana karşı, operatöre karşı değil.
- **Yetki kümesi onaylayandan türetilmiyor**, sabit COMPANY_ADMIN şablonu.
  "Kendinde olmayanı veremezsin" kuralı personel hesapları arasındaki devri
  sınırlar; buradaki hesap DEALER ailesinde ve o ailenin alabileceği izinlerin
  tamamı `PERMISSION_SCOPE`ta zaten satıcıya kapalı. Kural buraya taşınsaydı
  `reports.build` izni olmayan bir yönetici bayi açamazdı.
- Yeni izin `applications.manage` (SELLER'a kapalı, ayrı göçle mevcut süper
  adminlere veriliyor), yeni ekran `/admin/basvurular`, 15 yeni rota testi.

**Ret gerekçesi başvurana gitmiyor.** Karar notu iç bir kayıt ve çoğu zaman
"cari riski", "bölge doluluğu" gibi müşteriye söylenmeyecek bir cümle.
Başvurana giden şey kararın kendisi.

Doğrulama: `tsc --noEmit` temiz, `next lint` temiz, `vitest run` 233/233 geçti
(218 → 233), `next build` başarılı, 8 ekran görüntüsü `adim-8/` altında.

**Açık kalan:** `hesabim` ve `403` hâlâ eski hâlinde — Adım 8'in geri kalanı.

### ✔ Adım 4 — Finans (bitti)

`admin/kasa`, `admin/cekler`, `admin/iadeler`, `admin/kurlar`,
`admin/payment-terms`, `admin/volume-tiers`.

**Üç yerel `Stat` kutusu silindi.** Çek, iade ve gün sonu ekranlarının her biri
kendi sayı kutusunu yazmıştı — üçü de aynı işi yapıyor, üçü de farklı puntoda.
Hepsi `StatTile`a geçti. Kur ekranındaki para birimi kartları da aynı kutuya
oturdu: eksik kur artık kırmızı bir künye değil, kırmızı bir kutu ipucu, ve
"1 gün önce girildi" uyarısı kehribar.

**İki yerel `FilterChip` silindi**, ikisi de `Chips`e geçti. Yuvarlak düğmeler
(`rounded-full`) tasarım dilinin 3. kuralını çiğniyordu.

**Yeni ortak bileşen `Note`** (`ui.tsx`): ekranın altındaki kural açıklaması.
Sekiz yönetim ekranı bunu `text-sm text-neutral-500` diye kendi yazıyordu.
Kutuya konmadı, kenar çizgisiyle ayrıldı — okunması _gereken_ bir uyarı değil,
isteyenin okuyacağı bir dipnot; kutu ona hak etmediği bir ağırlık verirdi.

**Yeni düğme çeşidi `dangerQuiet`** (`form.tsx`): listedeki "Sil" için. Ekran
görüntüsü sebebi gösterdi — hacim iskontosu ekranında dört satırın dördünde de
dolu kırmızı bir "Sil" düğmesi vardı ve ekran, satırın asıl eylemi olan
"Düzenle"den çok o dört kırmızı bloğu okutuyordu. Yıkıcılık kaybolmadı, sesini
üzerine gelene kadar yükseltmiyor; onay penceresi ağırlığı zaten taşıyor. Dolu
kırmızı, gerekçesi yazılmış ve tetiği çekilen eylemde (`İptal et`) kaldı.

**Ekleme şeritleri gömük zemine indi.** Vade, hacim ve hesap ekranlarında
"ekle" formu listenin üstünde, `bg-sunken` bir şeritte ve altındaki listeden
bir çizgiyle ayrılıyor — tablo başlığıyla aynı yüzey.

Ekran görüntüsü çekerken çıkan, `tsc`/lint/test/build'in dördünün de
yakalamadığı üç şey:

- **Kasa hareketleri sayfayı yutuyordu.** Yüz satır, iki satırlık künyelerle
  3000 pikselden uzun bir liste çiziyor ve altındaki "Hesaplar" paneli ile
  dipnot hiç görünmüyordu. İki para listesi (hareketler, kart tahsilatları)
  `Table`a geçti — defter zaten tablo istiyordu — ve uzun panel en alta alındı.
  İptal gerekçesi hücreye sıkıştırılmıyor, satırın altında `colSpan`lı bir
  satırda soruluyor: hücreye konsaydı bütün sütunları genişletirdi.
- **İade tablosunun eylem sütunu ekrandan taşıyordu.** Dokuz sütun 1440
  pikselde sığmıyor ve taşan sütun "İşlem" oluyordu; yani ekranın tek eylemi
  yatay kaydırmadan görünmüyordu. Belge numarası siparişini, firma gerekçesini
  alt satırına aldı — dokuz sütun yediye indi. Ayrıca `IAD-20260826-0017`
  sarmalanıp satır boyunu üçe katlıyordu (`whitespace-nowrap`).
- **Vade ekranı başlığını iki kez yazıyordu**: sayfa başlığı da panel başlığı
  da "Vade tanımları"ydı. Panel "Tanımlar" oldu.

Sayaçlar (eşleşen satır sayısı, `app` + `components`): `dark:` 220 → **191**,
`neutral-` 417 → **366**, `brand-` 18 (değişmedi).

**Dördüncü hata görüntülerin kendisindeydi.** İlk kaydedilen altı dosyanın
altısı da ham HTML'di — mavi altı çizili bağlantılar, kutusuz form, Times New
Roman. Sebep: doğrulamayı yaparken `next build`i geliştirme sunucusu ayaktayken
çalıştırdım. İkisi aynı `.next` klasörünü paylaşıyor; derleme sunucunun sunduğu
CSS/JS parçalarını yerinden etti, sunucu ölmedi, tarayıcı parçaları 404 aldı ve
betik altı bozuk dosyayı hiç sesini çıkarmadan yazdı. `networkidle2` de
`settle()` de "stil geldi mi" diye sormuyordu.

`screenshots.mjs` artık her sayfada `assertStyled` çağırıyor: stil sayfası
sayısı sıfırsa ya da `body` tarayıcı varsayılanı 8px kenar boşluğunu taşıyorsa
(Tailwind sıfırlaması onu 0'a çekiyor) hata veriyor. Ham HTML
`{sheets: 0, margin: "8px"}`, sağlam sayfa `{sheets: 1, margin: "0px"}` —
ikisi de temadan bağımsız. **Derlemeyi sunucu ayakta çalıştırmayın**;
olduysa sunucuyu durdurup `apps/web/.next`i silin.

Doğrulama: `tsc --noEmit` temiz, `next lint` temiz, `vitest run` 233/233 geçti,
`next build` başarılı, 6 ekran görüntüsü `adim-4/` altında (temiz sunucudan
yeniden çekildi).

### ✔ Adım 5 — Operasyon (bitti)

`admin/deliveries`, `admin/stok`, `admin/labels`, `admin/documents`, `kurye`,
`documents/**`.

**Stok defteri beş panelden dört sekmeye indi.** Paneller alt alta duruyordu ve
ikisi tek başına iki yüz satır çizebiliyor: sayfa altı bin pikseli aşınca
alttaki depo paneline ve dipnota kimse ulaşmıyordu — Adım 4'te kasa ekranında
çıkan hatanın aynısı. Dönemin üç sayısı (giren / çıkan / net) sekmenin
**dışında**, hep görünen yerde: hangi sekmede olursanız olun sorulan ilk soru
"bu ay defter ne kadar oynadı".

- **Sekme URL'de** (`?bolum=durum|partiler|hareketler|depolar`). Bileşen
  durumunda tutmak daha az kod olurdu ama o hâlde üç sekmenin ekran görüntüsü
  hiç alınamazdı: betik bir adrese gidip resmini çekiyor, düğmelere basmıyor.
  Fotoğraflanamayan ekran, doğru göründüğü söylenemeyen ekrandır. Sayfaya
  `dynamic = "force-dynamic"` eklendi — `useSearchParams` ancak isteğe göre
  çizilen bir sayfada Suspense sınırı istemiyor.
- **Dipnot sekmenin içine indi.** Önce sayfanın altındaydı ve depolar
  sekmesinde iki `Note` alt alta düşüyordu (ekran görüntüsü gösterdi). Artık
  kural açıklaması hangi sekmeyi anlatıyorsa orada: bakiye tanımı stok
  durumunda, ERP/ters kayıt hareketlerde, FEFO partilerde, "depo silinmez
  kapatılır" depolarda.
- **Üç liste de sınırlandı: 50 satır.** Stok durumu 200'dü (2.654 ürünlük
  katalogda altı bin pikselden uzun bir döküm), hareketler sunucu varsayılanı
  100, partiler sınırsızdı. Üçünün de altında kaç satır gösterildiğini ve
  gerisine nasıl gidileceğini söyleyen bir satır var. Aranan şeye giden yol
  kaydırmak değil, üstteki süzgeç.
- **Hareket defteri tabloya geçti** (`Table`), kalem listesi değil — defter
  zaten tablo istiyordu. İptal gerekçesi hücreye değil `colSpan`lı alt satıra
  soruluyor (Adım 4'te kasa defterindeki çözümün aynısı). Açıklama sütunu
  `line-clamp-2`: sipariş kaynaklı satırlarda açıklama zaten sipariş
  numarasıyla başlıyordu ve numarayı bir de ayrı yazmak hücreyi üç satıra
  çıkarıp bütün tabloyu uzatıyordu.
- **Üç hareket formu aynı anda değil sırayla.** Elle giriş, sayım ve aktarım
  üçü birden açıkken panelin üstünde on dört kontrollük bir duvar oluşuyordu;
  oysa kimse aynı anda hem sayım hem aktarım girmiyor. `Chips` seçiyor, form
  gömük zeminde tek şeritte duruyor. Aktarım şeridi yalnızca iki açık depo
  varken var.
- **Partilerde "Fire" `dangerQuiet` değil `ghost`.** Adım 4'ün `dangerQuiet`i
  dört satırlık bir ayar ekranı içindi; burada elli satır var ve kırmızı yazı
  sağ kenarda bir sütuna dönüşüyordu. Yıkıcılığı taşıyan şey zaten pencere:
  gerekçe zorunlu, partinin tamamı düşülüyorsa ayrıca onay isteniyor.
- Parti uyarıları (SKT'si geçmiş / 30 gün içinde / bloke / en yakın SKT) dört
  `StatTile`a çıktı; depolar listesi `Table`a geçti.

**Dağıtım ve kurye tek bileşenden çiziliyor** (`DeliveryBoard`), o yüzden ikisi
birden elden geçti. Liste kart kaldı, tablo olmadı: satırın yarısı adres ve beş
düğme, ve asıl iş kuryenin telefonunda yapılıyor — tablo orada yatay kaydırmaya
dönüşürdü.

- **Sayı kutuları yalnızca dağıtımı yapanda** (`orders.fulfil`). Kuryenin
  telefonunda tek bir liste var ve ekranın üstünü kutulara vermek o listeyi
  ekran dışına iter. "Teslim edildi" kutusu, süzgeç kapalıyken sayı değil tire
  gösteriyor: sıfır yazsaydı bugün hiç teslimat yapılmadığını söylerdi, oysa
  söyleyebileceği tek şey o satırların hiç indirilmemiş olduğu.
- Yola çıkaran iki eylem (yol tarifi, telefon) çerçeveli; üç kâğıt bağlantısı
  arkalarında `ghost`. Beşi de aynı görünseydi kurye, kapıda hangisine
  basacağını her seferinde okumak zorunda kalırdı.

**Etiket tasarımcısı**: tasarım seçimi düğme dizisinden `Chips`e geçti (bu bir
daraltma, sayfa değiştirme değil), satır silme `dangerQuiet` oldu, önizleme
kâğıdı `shadow-inner` yerine 1px çizgiyle ayrıldı. İçeriği olmayan satırlarda
(ayraç, boşluk) metin alanının yerine boş bir esneme kondu — olmasaydı
hizalama ve boyut kutuları o satırlarda sola kayıp sütun hizasını bozuyordu.
Önizleme beyaz zemin ve siyah yazıyla kalıyor, koyu temada dönmüyor: bu bir
arayüz yüzeyi değil kâğıdın kendisi.

**Belge serileri** `PageHeader` + `Note` + gömük ekleme şeridi aldı; ham yeşil
ve kehribar `<span>`lar `Badge` oldu, "Sil" `dangerQuiet`e geçti. Liste tabloya
**alınmadı**: kurulum başına iki üç seri var ve her satırın içinde düzenlenen
bir sayaç alanı duruyor — üç satırlık bir tabloya form kutusu koymak, tablonun
sütun hizasını satırın içindeki kontrole feda ediyordu.

**Yazdırma yüzeyleri (`documents/**`) bilerek ham `neutral-` kaldı.** Anlamsal
tokenlar koyu temada dönüyor; bu sayfalar kâğıda basılıyor ve zemin her zaman
beyaz. `bg-panel` yazsaydık, tarayıcısı koyu temada olan birinin çıktısı
beyaz üstüne beyaz olurdu. Yalnızca ölçüler tasarım dilinden alındı (yazdır
düğmesi 32 piksel, 4px köşe). Adım 10'un "`neutral-` sıfır olsun" hedefi bu
dizini kapsamıyor. İki yazdırma ekranı yine de kayıt defterine eklendi —
kuralın dışında olduğunu görebilmek için.

Ekran görüntüsü çekerken çıkan, `tsc`/lint/test/build'in dördünün de
yakalamadığı şeyler:

- **"Yol tarifi" boş bir haritaya gidiyordu.** Gösterim siparişlerinde sevk
  adresi yok; adres de koordinat da boş olunca bağlantı hedefsiz kuruluyor ve
  kurye kapıda düğmeye basınca hiçbir yeri göstermeyen bir arama açılıyordu.
  Artık adressiz sevkiyatta düğme hiç çizilmiyor, yerine kehribar bir
  &ldquo;Sevk adresi yok&rdquo; künyesi çıkıyor: söylenecek şey "yol tarifi"
  değil, adresin olmadığı.
- **Üç liste de sayfayı 6000 piksel sınırında kestiriyordu** (yukarıda).
- **Depolar sekmesinde iki dipnot alt alta** (yukarıda).
- Etiket tasarımcısında ayraç satırlarının kontrolleri sola kayıyordu
  (yukarıda).

`DEMO-KULLANICILAR.md`de kurye hesapları eksikti (`kurye1@bayraktar.local`,
`kurye2@bayraktar.local`) — kurye masasının görüntüsü onlarla çekiliyor, bölüm
eklendi.

Sayaçlar (eşleşen satır sayısı, `app` + `components`): `dark:` 191 → **159**,
`neutral-` 366 → **318**, `brand-` 18 → **15**.

Doğrulama: `tsc --noEmit` temiz, `next lint` temiz, `vitest run` 233/233 geçti,
`next build` başarılı (sunucu durdurulup `.next` silindikten sonra, ayrı
sırada), 10 ekran görüntüsü `adim-5/` altında.

**Açık kalan:** gösterim siparişlerinin hiçbirinde `shippingAddressId` yok —
firmaların adresi var ama sipariş onu taşımıyor. Bu yüzden dağıtım ekranı,
kurye masası ve irsaliye adressiz görünüyor. Arayüz tarafı artık bunu doğru
söylüyor; asıl soru sipariş oluştururken firmanın varsayılan adresinin
bağlanıp bağlanmayacağı ve bu bir sipariş kuralı kararı, tasarım kararı değil.

### ✔ Adım 6 — Yapılandırma ve sistem (bitti)

`admin/promotions`, `admin/categories`, `admin/customer-groups`,
`admin/sayfa-duzeni`, `admin/kurulum`, `admin/organization`, `admin/erp`,
`admin/announcements`, `admin/jobs`, `admin/surum`, `admin/users`,
`admin/audit`, `admin/activity`, `admin/targets` — ve `admin/users` ile
`portal/users`ın paylaştığı `user-manager` + `permission-picker`.

**On sayfa başlığını kendi yazıyordu.** `<h1 className="mb-5 text-xl font-bold">`
on bir dosyada tekrar ediyordu (biri Adım 7'ye ait, ona dokunulmadı) ve
kategoriler ekranının hiç başlığı yoktu — kenar çubuğunda "Kategoriler" yazıyor,
sayfada hiçbir şey. Hepsi `PageHeader`a geçti, hepsine bir alt satır yazıldı.
Aynı şekilde ekran dibindeki sekiz `<p className="mt-4 text-sm text-neutral-500">`
`Note` oldu.

**Dört yeni ortak bileşen** — dördü de bu adımda en az iki ekranda tekrar
ediyordu:

- `Meter` (`ui.tsx`): doluluk çubuğu. Hedef kartı ve kurulum ilerlemesi bunu
  ayrı ayrı yazmıştı ve **üç ayrı renk** seçmişti (`bg-brand-500`,
  `bg-blue-500`, `bg-emerald-500`). Renk burada da işaret: varsayılan mürekkep,
  kehribar "geride", yeşil "tamam".
- `Field` / `DefRow` (`ui.tsx`): künye alanının iki yönü. `Field` etiketi üstte
  yazar (kuruluş bilgileri, saklama sayıları), `DefRow` solda — değerler sağda
  bir kolon oluşturur (sürüm ekranı, bakım işi kartı). Dört yerde dört farklı
  puntoya oturmuşlardı.
- `MultiChips` (`ui.tsx`): `Chips`in çoklu seçim hâli, duyurunun hedef grupları
  için. Sınıflar `Chips` ile paylaşılıyor — aynı ekranda iki farklı "seçili
  küçük düğme" görüntüsü olmasın diye.
- `MultiSelect` (`form.tsx`): kampanya kuralının "şu kategorilerde" alanı.
  `Select`ten ayrı, çünkü yüksekliği satır sayısından geliyor; `CONTROL_SIZE`
  uygulanınca liste tek satıra iniyordu.

**Uygulamanın tek radyo grubu kaldırıldı.** Kampanya formundaki VE/VEYA seçimi
ham `<input type="radio">` çiftiydi — odak halkası yok, koyu tema yok, boy
yok. İki seçenekli bir form alanı bu depoda her yerde `Select`; tek kullanım
için beşinci bir kontrol çeşidi yazmak, o üç şeyi ikinci kez yazmak olurdu.

**Beş liste tabloya geçti**: kampanyalar, kategoriler, kullanıcılar, güvenlik
kaydı ve ERP eşitleme geçmişi. Beşi de zaten tablo istiyordu; ikisi (`audit`,
`user-manager`) ham `<table>` yazmıştı, üçü kart listesiydi. Kategori ağacının
girintisi ilk hücrede duruyor — hiyerarşi adres satırında tutulmadığı için
sütunun kendisi taşıyor.

**Üç liste hâlâ liste**: müşteri grupları, ajanlar, duyurular. Sebep belge
serilerindekiyle aynı ve Adım 5'te yazılmıştı — satırın kendisi düzenleniyor ve
üç satırlık bir tabloya form kutusu koymak, sütun hizasını satır içindeki
kontrole feda ediyor.

**Kurulum sihirbazında mavi kalmamıştı ama vardı.** "Sıradaki adım" mavi bir
çerçeve + mavi bir halkayla işaretleniyordu; tasarım dilinde mavi hiçbir şey
söylemiyor. Kenar `border-line-strong`a indi ve yön bir künyeyle söyleniyor:
`Sıradaki`. "İsteğe bağlı" yuvarlak hapı `Badge` oldu (3. kural), paketin ham
siyah düğmesi `Button`, adım bağlantısı `LinkButton`.

**`Note` artık `<code>`u da biçimlendiriyor.** Dipnotların yarısı bir dosya adı
ya da bir komut söylüyor; kutu iki ekranda elle yazılmış, gerisinde çıplak
kalmıştı — aynı cümlenin iki görüntüsü.

Ekran görüntüsü çekerken çıkan, `tsc`/lint/test/build'in dördünün de
yakalamadığı yedi şey:

- **İki ekranda başlık iki kez yazıyordu**: sayfa başlığı da panel başlığı da
  "Kampanyalar", diğerinde ikisi de "Kullanıcılar". Adım 4'te vade ekranında
  çıkan hatanın aynısı; paneller "Tanımlar" ve "Hesaplar" oldu.
- **Güvenlik kaydı ve hareket akışı sayfayı 6000 piksel sınırında
  kestiriyordu.** İkisi de `limit=100` istiyordu; güvenlik kaydında bu, altındaki
  **sayfalama düğmelerinin** hiç görünmemesi demekti — yani listenin gerisine
  gitmenin tek yolu ekranın kesilen kısmındaydı. İkisi de 50'ye indi ve altlarına
  kaç satır gösterildiğini söyleyen bir satır kondu (Adım 5'teki stok
  listelerinin aynısı).
- **Bakım işleri de dipnotsuzdu**; sunucu zaten 50'de kesiyordu ama ekran bunu
  söylemiyordu.
- **Kullanıcı listesinde rol sütunu sarmalanıyordu.** Rol, hesap tipi künyesi,
  firma sayısı ve yetki sayısı tek satıra diziliyordu ve sütun dar olduğu için
  "10" ile "yetki" ayrı satırlara düşüyordu. İki satır oldu: üstte rol +
  künye, altında sayılar.
- **Elli satırın üstünde `dangerQuiet` bir sütuna dönüşüyor.** Kategoriler (55
  satır) ve kullanıcılar (35) sağ kenarda kırmızı bir kolon çiziyordu — Adım
  5'te stok partilerinde çıkan durum. İkisi `ghost` oldu; kısa ayar listeleri
  (kampanya, grup, duyuru, ajan) `dangerQuiet` kaldı. Kural: **kırmızı yazı bir
  satırda uyarıdır, elli satırda desendir.**
- **Kurulum paketi kartlarında düğmeler hizasızdı** — özet metni uzun olan
  pakette "Bu paketi uygula" aşağı kayıyordu.

Ayrıca kod okunurken çıkan bir şey: **ajan silme onaysızdı.** Düğme dolu
kırmızıydı ama `confirm` yoktu — tek tıklama, ERP köprüsünün tokeni anında
geçersiz. `dangerQuiet` + onay penceresi oldu; Adım 4'ün kuralı gereği dolu
kırmızı yalnızca gerekçesi yazılmış ve tetiği çekilen eylemde kalıyor.

Sayaçlar (eşleşen satır sayısı, `app` + `components`): `dark:` 159 → **83**,
`neutral-` 318 → **186**, `brand-` 15 → **13**.

Doğrulama: `tsc --noEmit` temiz, `next lint` temiz, `vitest run` 233/233 geçti,
`next build` başarılı, 14 ekran görüntüsü `adim-6/` altında.

**Açık kalan:** `/admin/reports` ve `reports/**` Adım 7'de; `admin/reports`
kenar çubuğundan bu adımın ekranlarıyla aynı grupta görünüyor ama içeriği rapor
tasarımcısının parçası.

### ✔ Adım 7 — Rapor tasarımcısı ve panolar (bitti)

`reports`, `reports/new`, `reports/[id]`, `reports/dashboards`,
`reports/dashboards/[id]`, `admin/reports` ve yazdırma yüzeyi — artı ikisinin
paylaştığı `components/report-preview.tsx`.

**Yazdırma yüzeyi `documents/**` ailesine taşındı — adresiyle birlikte.**
`/reports/[id]/print` → **`/documents/reports/[id]`**. Sebep ekran
görüntüsünde çıktı: sayfa `reports/layout.tsx`in kabuğunu miras alıyordu, yani
kâğıda basılacak sayfanın solunda 256 piksellik gezinme çubuğu duruyordu ve
`@media print` onu gizlemiyordu. Bir yazdırma yüzeyi kabuk altında duramaz;
`documents/**` zaten kabuksuz. Ham `neutral-*` sınıfları orada **bilerek**
kalıyor (kâğıt her zaman beyaz), ama `DocumentShell` kullanılmıyor: o kabuk
kiracı klasörü yoksa belgeyi "geçersiz" ilan ediyor — irsaliye için doğru,
rapor için değil. Bir rapor hukuki bir kayıt değil, bir çıktı.

**Grafiklerin sekiz renkli paleti kaldırıldı.** `report-preview` indigo, teal,
kehribar, kırmızı… diziyordu ve tasarım dilinin 1. kuralını tek başına çiğneyen
yer orasıydı. Yerine `--ink` üzerine sekiz basamaklı bir **saydamlık rampası**
geldi: dilimler zaten büyüklüğe göre sıralı, göz koyudan açığa okuyor. Rampa
CSS değişkeninden beslendiği için koyu temada `dark:` ikizi olmadan dönüyor.

**Hazır raporların beş sekmesi adrese taşındı** (`?bolum=satis|urunler|
plasiyerler|tahsilat|alacak`). Stok defterindeki kararın aynısı: fotoğraflanamayan
ekranın doğru göründüğü söylenemez, ve betik düğmelere basmıyor.

**Yeni ortak bileşen — `WarnLine`** (`form.tsx`). `ErrorLine`ın kardeşi:
kırmızı "işlem olmadı" der, kehribar "oldu ama şunu bilin". Dört ekran bu
kutuyu kendi yazmıştı (giriş, şifre sıfırlama, çek tahtası, pano) ve ikisi ham
`amber-*`, ikisi anlamsal `caution` kullanıyordu — aynı cümlenin iki görüntüsü.
Dördü de bileşene geçti.

`formatCell` `report-preview`den **`lib/format`a** taşındı: yazdırma yüzeyi bir
sunucu bileşeni ve tek bir yardımcı için `"use client"` bir modülden içe aktarım
yapıyordu.

**Gösterim rapor tanımları eklendi** (`packages/services/src/demo-reports.ts`,
`pnpm --filter @repo/services demo:reports`). Kurulumda tek bir rapor tanımı
yoktu; yedi ekranın dördü boş kutu olarak fotoğraflanıyordu ve boş bir rapor
ekranı, ekranın kendisi hakkında hiçbir şey söylemiyor. Dört tanım (aylık ciro ·
firma bazında ciro · kategori kırılımı · plasiyer cirosu) ve bir pano, ada göre
upsert. `demo-seed`in "zaten yüklü" kapısının **üstünde** duruyor: bir rapor
tasarımı siparişlerden bağımsız ve gösterim verisini sıfırlamak (`cuid`
kimlikler) çok daha pahalı.

#### Ekran görüntüsünün yakaladığı, dördünün de kaçırdığı beş şey

- **Alan paletinde etiket düğmelerin altına giriyordu.** 260 piksellik sütunda
  "Hacim basamağı" gibi iki kelimelik her alan adı, yanındaki üç düğmeyle aynı
  satıra sığmıyordu. Etiket üste alındı, düğmeler altına. Kısaltmak seçenek
  değildi: paletin tek işi alanın adını okutmak.
- **Palet paneli iki bin piksellik boş bir kutuydu.** Izgara hücreyi geriyor;
  `self-start` ile içeriği kadar yükseliyor. Aynı hata hazır raporların iki
  panelli ızgaralarında ve pano kartlarında da vardı.
- **Yaşlandırma kutularında rakamlar kenardan kesiliyordu.** Altı `StatTile`
  1130 piksele bölününce her biri 170 piksel; 32 punto "₺1.583.469,02" oraya
  sığmıyor. Izgara üçe indi ve `StatTile` bir daha sessizce kesmesin diye
  `overflow-wrap: anywhere` aldı — para bir kutuya sığmadı diye basamak
  kaybedemez.
- **Yaşlandırma tablosu sınırsızdı ve yarısı sıfırdı.** Sunucu her aktif firmayı
  ada göre döndürüyor; ekranın sorusu ise "kim borçlu". Sıralama tutara göre,
  bakiyesi sıfır olanlar listeden çıktı, liste 50 satırda kesiliyor ve altına
  kaç firmanın gösterildiği yazıldı.
- **Pano kartı tabloyu rastgele bir yerden kesiyordu.** `max-h` + kaydırma
  kutusu bir kartta geriye yalnızca tablonun başlık satırını bırakmıştı.
  Kaydırma kutusu kaldırıldı: `compact` kip **veriyi** sekiz satırda kesiyor ve
  üstündeki tarama satırı kaç satır olduğunu söylüyor. Fotoğraf kaydırmıyor;
  kart neyi gösterecekse tamamını göstermeli.

#### Yol boyunca çıkan iki gerçek hata

- **Enum süzgeci gruplanmış raporda çalışmıyordu.** Postgres enum sütununu metin
  parametresiyle karşılaştırmıyor (`operator does not exist: "OrderStatus" <>
text`) ve ham SQL yolu sütunu `::text`e çevirmiyordu. Gruplamasız yol Prisma
  sorgu kurucusundan geçtiği için etkilenmiyordu — hata yalnızca `GROUP BY`
  varken görülüyordu. "İptal ve red hariç" diye başlayan her ciro raporu 500
  dönüyordu. Regresyon testi `apps/web/test/reports.test.ts`te.
- **Gün/ay kovası üç saat geriye kayıyordu.** Prisma `DateTime`ı
  `timestamp without time zone` olarak yazıp içine UTC koyuyor; çıplak bir
  damgaya `AT TIME ZONE 'Europe/Istanbul'` uygulamak "bu duvar saati İstanbul
  saatidir" demek, yani dönüşüm ters yöne çalışıyordu. Akşam 21:00'den sonra
  girilen her sipariş bir önceki günün cirosuna yazılıyordu. Doğrusu iki adım:
  `AT TIME ZONE 'UTC' AT TIME ZONE ${REPORT_TIMEZONE}`.

Ayrıca iki test kendi saat dilimi hatasıyla gece yarısından sonra kırılıyordu
(`stock-lots`, `stock-ledger`): gün dizgisini `toISOString()` ile UTC'den
üretip, yerel gün sınırıyla çalışan servise gönderiyorlardı.

Doğrulama: `tsc --noEmit` temiz, `next lint` temiz, `vitest run` 235 rota + 553
servis testi geçti, `next build` başarılı, 11 ekran görüntüsü `adim-7/` altında.

### ✔ Adım 8 (kalan) — Hesap ekranları (bitti)

`hesabim` ve `403`. `login`, `kayit` ve `sifremi-unuttum` yukarıda bitmişti.

**İkisi de kabuksuz ve bu bir istisna, kaza değil.** Tasarım dilinin 5. kuralı
"tek kabuk" diyor; sebebi `/hesabim`in ikinci adım kapısından muaf tek ekran
olması. Zorunlu kapsamdaki bir kullanıcı 2FA'sını kurana kadar başka hiçbir
ekrana giremiyor — kenar çubuğu çizilseydi oradaki her bağlantı onu kapıya,
kapı da geri buraya yollardı. Tek çıkış başlıktaki "Panele dön" ve o da
kullanıcının kendi rolünün varsayılan rotasına gidiyor. `/403` aynı aileden:
oraya düşen kişinin yapabileceği tek şey geri dönmek.

- **`Row` silindi, yerine `DefRow`.** Güvenlik durumu paneli künye satırını
  kendi yazmıştı ve ölçüleri ortaktan yarım punto farklıydı. İki sütuna
  dizilince alt sıradaki iki satırdan yalnızca biri kendi çizgisini
  kaybediyordu (`last:border-0` ızgarada son _elemanı_ biliyor, son _satırı_
  değil); `nth-last-child(-n+2)` ile ikisi birden.
- **Ham `<ul>` hareket listesi tabloya geçti.** Kullanıcının kendi denetim
  kaydı, yönetimdeki güvenlik kaydının tek kişilik hâli — aynı veri iki ekranda
  iki farklı görüntüde durmasın (Adım 6'da beş liste bu sebeple tabloya
  geçmişti).
- **Beş siyah düğmeden ikisi ikincil oldu**: "Kopyala" ve "Vazgeç". Yedek kod
  ekranında ikisi de siyahken hangisinin ileri götürdüğü belirsizdi. 2FA'yı
  kapatan düğme `dangerQuiet`: hesabın korumasını kaldırıyor ama panelin asıl
  eylemi değil (Adım 4 kuralı).
- **`{busy ? "Kaydediliyor…" : "Kaydet"}` kalıbı beş yerden kalktı** —
  `Button`ın kendi `loading`i zaten dönen bir çark çiziyor ve düğmeyi
  kilitliyor; metni değiştirmek düğmenin genişliğini de oynatıyordu.
- Kehribar paragraflar `WarnLine`a, zorunluluk dipnotu `Note`a geçti; her
  girdi `htmlFor` ile etiketine bağlandı.

QR karesi **her temada beyaz zeminde** kalıyor: okuyucu uygulamaların bir kısmı
koyu zemindeki kareyi çözemiyor ve bu, temaya bırakılacak bir tercih değil.

### ✔ Adım 11 — Saha üçlüsü ve kök (bitti)

`/`, `/rep`, `/rep/ziyaret`, `/rep/tahsilat` ve `components/target-scorecard`.

**Bu adım listede yoktu.** Adım 1'de bu dört ekranın _kabuğu_ `SidebarShell`e
döndürülmüştü ve o yüzden "elden geçti" sayılmışlardı; içerikleri hiç
açılmamıştı. Yeni bir numara açıldı, Adım 7'ye karıştırılmadı: sonraki devir
teslimin "Adım 7 rapor ekranlarıydı" diye okuyabilmesi için.

**Kök sayfa `AuthShell`e taşındı.** Kendi kabuğunu çiziyordu: degrade bir marka
karesi, elle yazılmış bir düğme, ortalanmış bir sütun. Oysa oturumsuz üç ekranın
zaten ortak bir kabuğu var ve kök sayfa onların kardeşi — ziyaretçinin gördüğü
ilk yüzey. Sahne, tema düğmesi ve kart ölçüleri bedava geldi; üstüne **bayilik
başvurusuna giden bağlantı** da geldi, ki ön kapıda hiç yoktu (`/kayit`e tek
giriş `/login`in altındaki satırdı).

- **`Meter` hedef kartına da girdi.** Adım 6'da üç ekranın üç ayrı doluluk
  çubuğu tek bileşene indirilmişti; `target-scorecard` o turda gözden kaçmış ve
  hâlâ kendi çubuğunu üç ayrı renkle (`emerald`, `amber`, `brand`) çiziyordu.
- **Üç ekranın üç ayrı `Stat` kutusu `StatTile` oldu.** Plasiyer panosunda ve
  tahsilat ekranında ikisi de yerel bir `Stat` yazmıştı, ikisi de farklı
  puntoya oturmuştu.
- **Tahsilat şekli şeridi `Chips`e geçti.** Kendi "seçili" görüntüsünü yazıyordu
  (marka çerçevesi + açık zemin) ve aynı arayüzde ikinci bir seçili-küçük-düğme
  hâli üretiyordu.
- **Ziyaret planındaki dokuz ham `<button>`/`<a>` `Button`/`LinkButton` oldu.**
  Çağrı iptali `dangerQuiet`: on kartlık bir günde dolu kırmızı bir sütun
  çiziyordu.
- **Portföy tablosu artık borca göre sıralı.** Sunucu ada göre döndürüyor ve o
  sıra "bugün kimi arayacağım" sorusuna hiçbir şey söylemiyor. Liste
  **kesilmiyor**: buradaki satır aynı zamanda sipariş girmenin yolu ve borcu
  olmayan bir müşteriyi listenin dışına atmak, ona sipariş girmeyi
  zorlaştırırdı — alacak yaşlandırma ekranındaki kararın tam tersi, çünkü
  oradaki tablonun tek işi borç saymak.

#### Ekran görüntüsünün yakaladığı iki şey

- **Ziyaret ekranı 4992 piksele çıkıyordu.** Sunucu son 50 ziyareti gönderiyor
  ve hepsi birden çiziliyordu; üstteki gün planı ve harita fotoğrafta
  kayboluyordu. Kesme **çizimde** yapıldı, istekte değil: veri zaten elde, 15
  satır gösteriliyor ve "Tümünü göster" yeni bir istek atmadan gerisini açıyor.
- **`SON 30 GÜN CİRO` iki satıra sarıyordu.** Dört sayı kutusu 1024 piksele
  bölününce her biri 245 piksel kalıyor ve 32 puntoluk yedi haneli bir tutar
  oraya sığmıyor. Sayfa `max-w-6xl`e genişledi (portföy tablosu zaten altı
  sütun). `StatTile`ın Adım 7'de aldığı `overflow-wrap` bu yüzden son çare
  olarak duruyor: kesmiyor, sarıyor — ve sardığını görünce ızgarayı
  düzeltiyorsunuz.

Doğrulama: `tsc --noEmit` temiz, `next lint` temiz, `vitest run` yeşil,
`next build` başarılı, 5 ekran görüntüsü `adim-11/` altında.

### ✔ Adım 12 — Yönetici panosu (bitti)

`/admin/analitik`, altı bölüm, hepsi `?bolum=` ile adreste.

Bu bir ekran yenilemesi değil **yeni bir ekran**; yenilemenin numaralandırmasına
girmesinin sebebi tek: grafiklerin ortak dili burada oturdu.
`components/charts.tsx` — `BarChart`, `LineChart`, `PieChart`, `Waterfall`,
`HeatCell` — ve rapor önizlemesi de artık oradan besleniyor. İkisi ayrı
yazılsaydı tasarım dili iki yerden yönetilmeye başlardı.

**Ölçüm ve gerekçe `docs/KALAN-ISLER.md` §6'da**; buraya yalnızca görüntüye ait
kararlar:

- **Renk yok, ton var.** Kohort ısı haritası, pasta dilimleri ve şelale
  grafiğinin artı/eksi kolonları `--ink` üzerine saydamlıkla ayrılıyor. Yeşil/
  kırmızı kullanılmadı çünkü tasarım dilinde renk _durum_ bildiriyor; köprüdeki
  artı ve eksi bir durum değil bir **yön**.
- **Isı hücresinin yazı rengi zeminle dönüyor**: %60'ın üstünde `on-accent`,
  altında `ink`. Sabit bir yazı rengi matrisin bir ucunda okunamaz olurdu.
- **Sayının yerine cümle.** Yeterli veri olmadığında kutuya 32 puntoluk bir tire
  konuyordu ve bozuk bir çizim gibi duruyordu (ekran görüntüsünde görüldü);
  yerine "yetersiz veri" yazıyor, sebebi de altındaki ipucunda.
- **Her kutu kaynağına bağlı.** Tıklanınca sayıyı üreten listeye gidiyor.
  Karşılığı olan bir ekran yoksa kutu düz kalıyor — tıklanabilir görünüp hiçbir
  yere gitmeyen bir kutu, hiç bağlantısı olmayandan kötü.

Doğrulama: `tsc --noEmit` temiz, `next lint` temiz, `vitest run` yeşil (24 yeni
matematik testi), `next build` başarılı, 6 ekran görüntüsü `adim-12/` altında.

### ✔ Adım 13 — Excel ile toplu güncelleme (bitti)

`/admin/toplu-guncelleme`, iki sekme (`?bolum=fiyat|stok`).

Ekranın tamamı **akışın kendisi**: numaralı paneller (1 · dosyayı seçin, 2 ·
fark), ve "uygula" düğmesi ancak fark geldikten sonra çiziliyor. Fark
satırları dört durum künyesiyle işaretli — değişecek, yeni satır, aynı,
reddedilen — ve reddedilen varsa üstte kehribar bir uyarı duruyor: uygulamak
yine mümkün ama o satırlar çoğu zaman kaymış bir kopyalamanın işareti.

Önizleme 300 satırda kesiliyor ve **kesildiği yazılıyor**: "300 satır gördüm,
onayladım" diyen biri 4000 satır uyguladığını bilmeli. Kesilen yalnızca çizim;
imza ve uygulama satırların tamamından çıkıyor.

Gerekçe ve sunucu tarafı `docs/KALAN-ISLER.md` §5.1'de.

### ✔ Adım 15 — Sipariş kuralları (bitti)

Yeni ekran: **`/admin/siparis-kurallari`** (Finans grubunda, `order_policy.manage`).
İki panel, iki ayrı soru — tek panelde alt alta dursalardı tek bir kural gibi
okunurlardı:

- **Asgari sipariş**: tutar (net mal bedeli) ve koli adedi. İkisi de doluysa
  ikisi de gerekiyor.
- **Sevkiyat kesim saati**: saat + "cumartesi sevkiyat var".

Her iki panelin altında kuralın **düz cümleyle okunuşu** duruyor ve girilen
rakamla birlikte değişiyor ("Bayi en az 5.000,00 ₺ ve 3 koli sipariş vermeden
sepeti kapatamıyor"). İki sayı kutusuna bakıp ne olacağını çıkarmak, cümleyi
okumaktan zor.

Sepet tarafında iki ekleme:

- Eşiğin altındaki sepet **eksiği rakamla** söylüyor ("5.000,00 ₺ asgari tutar
  için 4.000,00 ₺ daha ekleyin") ve sipariş düğmesi kapanıyor. "Asgari tutarın
  altındasınız" diyen bir uyarı, sepete ne ekleyeceğini bilmeyen bir müşteri
  bırakırdı; reddi tıklamadan sonra göstermek ise sepeti kapattığını sanan
  müşteriyi geri döndürürdü.
- Kesim saati tanımlıysa sevkiyat günü yazıyor. Tanımlı değilse **hiçbir şey**
  yazmıyor: söz verilmeyen bir gün, verilmiş gibi görünmemeli.

Firma sayfasına da bir alan geldi: **asgari sipariş (₺)**, ipucu "boş = genel
kural, 0 = muaf".

**Toplu güncelleme ekranına üçüncü sekme** geldi: `?bolum=zamanli` —
zamanlı fiyat kuyruğu. Kuyruk ayrı bir sayfaya konmadı çünkü oraya kayıt
buradan giriliyor: zamanlı fiyat, fiyat sekmesinden yüklenen dosyanın
"Geçerlilik tarihi" sütunundan doğuyor ve sonucunu görmek için başka bir adrese
gitmek gerekmemeli. Sekme kayıt **açmıyor**, yalnızca gösteriyor ve bekleyen bir
satırı iptal ediyor — bir zam listesi yüzlerce satır ve onu tek tek forma girmek,
listeyi zaten Excel'de kuran kişiye yapılabilecek en kötü teklif.

Fark önizlemesi bir **Yürürlük** sütunu aldı ve tarihsiz satır orada "hemen"
yazıyor: boş bir hücre, tarih girmeyi unutmuş kişiye hiçbir şey söylemez.

**Dağıtım ekranı ikiye ayrıldı** (`?bolum=sevkiyat` / `?bolum=bekleyen`): yola
çıkmış mal ve henüz çıkmamış bakiye. İkisi aynı işin iki ucu ve aynı ekranda
duruyorlar, çünkü "bugün ne sevk edeceğim" sorusunun cevabı ikisinde birden.
Bekleyen sekmesi kendi içinde de ikiye bölünüyor — ürün bazında (depo sorusu) ve
sipariş bazında (müşteri sorusu).

**Cari mutabakat** iki ekran getirdi: yönetimde `/admin/mutabakat` (dönem
mektubu + cevaplar), alıcı tarafında ise **cari ekstrenin üstünde** bir panel.
Ayrı bir menü maddesi açılmadı: mutabakat bir bakiye hakkında ve müşteri o
bakiyeye zaten orada bakıyor — yılda iki kez kullanılan bir ekranı her gün
göstermenin karşılığı yok. Cevaplanmamış mektup yoksa panel **hiç
çizilmiyor**.

Ekran görüntüleri: `adim-15/siparis-kurallari.png`,
`adim-15/zamanli-fiyatlar.png`, `adim-15/bekleyen-bakiye.png`,
`adim-15/mutabakat.png`, `adim-15/mutabakat-portal.png`,
`adim-15/tahsilat-listesi.png`, `adim-15/plasiyer-primi.png`.

**Prim ekranı** planları ve hakedişi yan yana gösteriyor. Ayrı sayfalara koymak,
oranı değiştiren kişinin sonucunu göremediği bir düzen olurdu.

**Tahsilat ekranının boş hâli değişti.** `/rep/tahsilat` firma seçilmeden önce
alfabetik bir seçici gösteriyordu; artık **çalışma listesi** gösteriyor — sabah
ekranı açan plasiyerin sorusu "hangi firma" değil, "bugün kimi arayacağım".
Seçici altında duruyor ve orada kalıyor, çünkü listede olmayan bir cariye de
tahsilat girilebilmeli.

Doğrulama: `tsc --noEmit` temiz, `next lint` temiz, `vitest run` 360 + 642
geçti, `next build` başarılı.

### ✔ Adım 14 — Arayüz artıkları (bitti)

Beş küçük madde ve bir bulgu. Hepsi tek tek küçük, ama beşi de aynı şeyi
söylüyordu: ekran doğru çiziliyor, **kullanıcıya bir sonraki adımı söylemiyor**.

#### §4.6 Süzgeçler adrese taşındı — kancası da yazıldı

Süzgeçler `useState` içindeyken iki şey birden bozuktu: paylaşılamıyorlardı
("geçen haftanın başarısız girişleri" bir bağlantı değil, tarif edilmesi gereken
bir tıklama dizisiydi) ve **fotoğraflanamıyorlardı** — betik adres ziyaret
ediyor, düğmeye basmıyor.

Ortak kanca `lib/url-state.ts`, dört kuralı var ve dördü de tek yerde:

1. **Varsayılana eşit değer adrese yazılmaz** — süzgeçsiz ekranın adresi temiz.
2. **Yalnızca kendi anahtarlarına dokunur** — `?bolum=` gibi başkasının
   parametresi `set`/`clear` sonrası yerinde kalır.
3. **`replace`, `push` değil** — on kez süzen kullanıcı geri düğmesine on kez
   basmıyor.
4. **`scroll: false`** — uzun listede süzgeç değiştirmek sayfayı başa sarmıyor.

Taşınan altı ekran: çek portföyü, iadeler, bayi başvuruları, güvenlik kaydı,
hareket akışı, kullanıcılar.

**Arama kutuları ayrı davranıyor** ve bu bilinçli: her tuşta adres yazmak her
tuşta bir sunucu gidiş-dönüşü demek. Yazılan metin yerelde, adrese `Enter`da ya
da alandan çıkınca işleniyor — ürün listesindeki "Ara" düğmesinin zaten yaptığı
şey. Yer tutucu bunu söylüyor: "Ad veya e-posta ara — Enter".

Yan kazanç: bayi başvuruları ekranı çip şeridini **elle** çizmişti (`Chips`in
kopyası, kendi renkleriyle); o şerit de paylaşılan bileşene döndü.

#### §4.5 Boş ekran artık bir sonraki adımı söylüyor

Kural şu oldu: **boşluğun sebebi süzgeçse eylem süzgeci temizler, liste
gerçekten boşsa eylem ilk kaydı açar.** Tek bir metin ikisini birden
anlatamıyordu — ürün listesi "Sağ üstten yeni ürün ekleyebilirsiniz" diyerek
aramada hiçbir şey bulamayan kişiyi ekranın öbür ucuna yolluyordu.

Uygulandığı yerler: ürünler, vitrin, çekler, iadeler, başvurular, güvenlik
kaydı, hareket akışı, kampanyalar, firma seçici. `TableEmpty` de `EmptyState`
gibi bir `action` yuvası aldı — tablo içindeki boşluk da bir sonraki adımı
söyleyebilsin.

#### §4.7 `orders/[id]` kabuğa girdi — son kural ihlali kapandı

Tasarım dilinin 5. kuralını ("tek kabuk") çiğneyen tek ekran buydu ve Adım
3'ten beri açıktı. Sipariş detayına dört rol birden giriyor, tek bir menü
hepsine uymuyordu, ekran da bu yüzden **hiç** menüsüz çiziliyordu: kullanıcının
elinde yalnızca başlıktaki "Geri" bağlantısı kalıyordu.

Çözüm rapor tasarımcısındakinin aynısı: `app/orders/layout.tsx` + `RoleShell`.
Rol listesi artık `lib/order-access.ts`te tek yerde (`ORDER_DETAIL_ROLES`) —
kabuk ve sayfa aynı listeyi okuyor, biri diğerinden gevşek kalamaz.

#### §4.8 `Modal` odağı içeride tutuyor

`aria-modal` ekran okuyucuya "arkası yok" diyor ama klavyeyi durdurmuyordu: Tab,
pencerenin son alanından sonra arkadaki sayfanın bağlantılarına geçiyordu.
Üç davranış eklendi ve üçü de tek yerde, çünkü pencere tek yerde yazılı:
açılışta odak içeri, Tab uçlarda sarıyor, kapanışta odak **pencereyi açan
öğeye** dönüyor (listede "Düzenle"ye basan klavye kullanıcısı listenin başına
fırlamıyor).

#### §4.9 `pnpm shots --check`

Yeni çekimi git'tekiyle kıyaslıyor, fark varsa sıfırdan farklı çıkıyor.

Bayt karşılaştırması **yapmıyor**: aynı ekran, aynı tarayıcı, farklı gün — PNG
sıkıştırması birkaç baytı oynatabiliyor ve hiçbir şeyin değişmediği bir koşu
kırmızı yanıyor. Ölçü piksel (kanal başına 8'den fazla sapan piksel "farklı"
sayılıyor), eşik yüzde birin onda biri. Boy değişimi doğrudan fark sayılıyor.
Yeni bağımlılık yok — `sharp` zaten görsel küçültmede kullanılıyor.

`adim-8/giris` muaf: sahne sürekli hareket ediyor ve iki çekim arasında aynı
kareyi yakalamak tesadüf olurdu. "Her zaman kırmızı" ile "hiç bakılmıyor"
arasında fark yok.

#### §4.11 Kategoriler ekranı artık iznini biliyor

Kapı `products.view` (katalogu *görmek*), her düğme `categories.manage`
istiyordu: okuma izniyle giren kullanıcı ekranı açıyor, adı değiştiriyor, 403
alıyor ve sebebini görmüyordu.

Kapı **yükseltilmedi** — o zaman katalogu görmek isteyen kişi ağacı hiç
göremezdi. İzin ekrana taşındı: yetkisi olmayan ekleme şeridini, yeniden
adlandırma düğmesini, üst kategori kutusunu ve Sil düğmesini görmüyor; başlık
"salt okunur" diyor ve dipnot hangi iznin gerektiğini yazıyor. Karar yine
sunucuda; bu yalnızca yapılamayacak şeyi önermemek.

#### Ekran görüntüleri

`adim-14/` altındaki beş dosyanın dördü **daha önce çekilemeyen** durumlar:
süzgeçli çek portföyü, süzgeçli güvenlik kaydı, saha ekibi sekmesi, boş dönen
ürün araması. Beşincisi sipariş detayının bayi kabuğuyla hâli.
`adim-3/admin-siparis-detay` de yenilendi — o ekran artık kabuklu.

Doğrulama: `tsc --noEmit` temiz, `next lint` temiz, `vitest run` 348 geçti
(+4: sipariş kabuğunun kapısı), `next build` başarılı.

### ▢ Adım 9 — Mobil

`apps/mobile` — aynı palet ve tipografi. NativeWind'in bilinen iki tuzağı için
`b2b-theme-engine` hafıza notuna bakın.

### ✔ Adım 10 — Temizlik (bitti)

**Ham sınıf sayacı sıfır.** `dark:` 83 → **0**, `neutral-` 186 → **0**,
`brand-` 13 → **0** (`documents/**` hariç; orada kâğıt her zaman beyaz).
Kalan son dördü perde rengiydi ve o bir ekranın değil bir _kuralın_ eksiğiydi:
pencerenin ve çekmecenin arkasındaki veil `bg-neutral-950/40` diye yazılmıştı
çünkü anlamsal token yoktu. Şimdi var — `--scrim`, ve diğerlerinin aksine koyu
temada **dönmüyor**: perde bir yüzey değil, yüzeyin üstüne çekilen gölge; açık
temada beyaza dönseydi hiç görünmezdi.

**Kiracı adı kabuğa bağlandı.** `SidebarShell`in markası sabit "B2B Portal"
idi; her müşteri kendi kurulumunu çalıştırdığı için orada kendi unvanı yazmalı.
Adı okuyan şey (`loadTenant`) dosya sistemine bakıyor, kullanan şey
(`SidebarShell`) bir istemci bileşeni: köprü `BrandProvider`. Kök yerleşim adı
bir kez okuyup sağlayıcıya veriyor, kabuk oradan alıyor — alternatif altmış bir
rotaya aynı prop'u geçirmekti. Sekme başlığı da (`generateMetadata`) artık
kiracının adı: on sekme açık bir tarayıcıda "B2B Portal" hangi kurulum olduğunu
söylemiyor. `AuthShell` sunucu bileşeni olduğu için adı doğrudan okuyor.

`loadTenant()` klasör yoksa fırlatıyor ve burada **yutuluyor** — irsaliyenin
aksine. Bir belgede eksik satıcı künyesi belgeyi geçersiz kılar; kenar
çubuğundaki ad ise bir etiket, yarım kurulumlu bir geliştirici makinesinde
uygulamanın hiç açılmaması kazandırdığından fazlasını götürürdü.

**Genel arama (Ctrl+K).** Ürün, firma ve sipariş numarası tek kutudan
(`components/command-palette.tsx` + `/api/search` + `services/search.ts`).
İki karar:

- **Kapsam sunucuda, bir kez.** Üç ayrı listeleme ucunu arka arkaya çağırmak da
  mümkündü ama her biri kendi kapsamını kendi yazıyor; arama kutusu hepsinin
  kesişimini tek cevapta vermek zorunda. Plasiyer portföyü dışındaki firmayı
  aramayla bulamıyor, bayi kullanıcısı başka bayinin siparişini açamıyor.
- **Kutu görünür, kısayol tek yol değil.** Bir tuş kombinasyonunu kimse
  kendiliğinden bulmuyor — ve fotoğraflanamayan ekranın doğru göründüğü
  söylenemez. Kutu üst şeritte duruyor; ekranın kendi araması varsa (vitrinde
  ürün araması) o kalıyor, yoksa genel arama geliyor. İkisini yan yana koymak
  kullanıcıya hangisinin ne aradığını sorardı.

#### §4.2 Yapışkan tablo başlığı

`THead`e tek satır `sticky` eklemek **işe yaramıyor** ve bunu ancak deneyince
görüyorsunuz. İki engel:

1. `Table`ın sarmalayıcısındaki `overflow-x: auto`, CSS kuralı gereği diğer
   ekseni de `auto`ya çeviriyor; yapışkan öğe artık sayfaya değil o kutuya
   tutunuyor ve kutu hiç kaydırılmadığı için başlık hiç yapışmıyor.
2. `Panel` ve ürün listesi sarmalayıcısı `overflow-hidden` taşıyordu — o da bir
   kaydırma kabı. **`overflow-clip`e çevrildi:** ikisi de köşeyi kesiyor ama
   `clip` kap açmıyor.

`Table` bu yüzden `stickyHead` bayrağı aldı: verildiğinde sarmalayıcı `sm`den
itibaren kaydırmayı bırakıyor ve başlık `top-16`ya yapışıyor (`top-0` değil —
kabuğun üst şeridi 64 piksel ve o da yapışkan). Bayrak isteğe bağlı, çünkü sekiz
sayı sütunlu geniş tablolar (alacak yaşlandırma) kaydırma kabuğunu korumak
zorunda.

#### §4.3 Sıralanabilir yönetim tabloları

`components/table-sort.tsx`: `useTableSort` + `SortableTh`. `ui.tsx`e
konmadı çünkü orası sunucu bileşenlerinden de içe aktarılıyor ve oraya bir kanca
koymak o sayfaları kırardı.

Üç karar:

- **Boş değer her zaman sona.** Yön ne olursa olsun: "en yüksek borç" dendiğinde
  listenin başında borcu olmayan satırların durması, sıralamanın cevaplamadığı
  tek soru.
- **Sayı gibi duran metin sayı gibi sıralanıyor.** Tutarlar sunucudan
  `Decimal`in dizgi hâli olarak geliyor ve alfabetik sıralamada "9" ile "10"
  ters düşüyor.
- **Her tablo sıralanmıyor.** Kategoriler bir _ağaç_ — ada göre sıralamak
  girintinin taşıdığı hiyerarşiyi siler. Güvenlik kaydı imleçle sayfalanıyor —
  yalnızca görünen elli satırı sıralamak "en eski kayıt" diye yanlış bir cevap
  verir. İkisi yapışkan başlık aldı, sıralama almadı.

#### §4.4 Kaydetme onayı

`components/toast.tsx`: sağ altta yeşil, küçük, dört saniyede sönen bir şerit.
Kutu değil ve onay istemiyor — bir pencere olsaydı her kaydetmeden sonra bir tık
daha isterdi. `aria-live="polite"`: görsel olarak akışın dışında, sesli okumada
içinde.

Sağlayıcı yoksa çağrı sessizce düşüyor: bileşenler testlerde sağlayıcısız da
çiziliyor ve "kaydedildi" diyememek bir hata değil. Hata fırlatmak, kaydetmenin
kendisini bir bildirim ayrıntısına bağlardı.

Bağlandığı yerler: kategoriler, duyurular, firma iskontoları, kullanıcı
yönetimi. Mesajı çağıran seçiyor — silmek ile rol değiştirmek aynı cümleyi hak
etmiyor.

#### §4.10 Uzun liste kuralı

Üç desen var ve hangisinin ne zaman kullanılacağı bugüne kadar yazılı değildi:

1. **İmleçli sayfalama** — sonu olmayan, yeniden eskiye okunan defterler
   (güvenlik kaydı, hareket akışı). Liste bitmiyor, dolayısıyla "hepsi" diye bir
   şey yok.
2. **Tavan + sayaç** — doğal bir büyüklüğü olan, gözle taranan listeler
   (kategoriler, kullanıcılar, depolar). Tamamı çiziliyor, altına kaç tane
   olduğu yazılıyor.
3. **Önce arama** — taranamayacak kadar büyük listeler (ürünler, vitrin).
   Ekran ilk N satırı çiziyor ve bunu söylüyor; belirli bir satırı bulmanın yolu
   kaydırmak değil arama kutusu.

Üçüncüsü için ortak bir kanca yazıldı (`components/show-more.tsx`):
`useVisibleSlice` + `ShowMore`. **Kesme çizimde, istekte değil** — liste zaten
bellekte ve sıralama, süzme, sayma onun tamamı üzerinde çalışıyor. Sunucudan
yalnızca ilk sayfayı isteyip "en ucuz önce" diye sıralamak, sayfanın en ucuzunu
bütün kataloğun en ucuzu diye göstermek olurdu.

Uygulandığı yerler ve öncesi:

| Ekran                        | Önce                          | Sonra                  |
| ---------------------------- | ----------------------------- | ---------------------- |
| `/portal` (vitrin)           | 2654 kart, 6000'de kesik      | 24 kart + "daha fazla" |
| `/admin/products`            | 200 satır, 6000'de kesik      | 50 satır + sayaç       |
| `/admin/kasa`                | tüm hareketler, 6000'de kesik | 50 satır + sayaç       |
| `OrdersBoard` (pano, portal) | 100 satır, 5490px             | 25 satır + sayaç       |

Ürün listesi ayrıca **sunucunun kendi tavanını** söylüyor: liste tam 200
geldiyse gerisi hiç indirilmedi ve 2654 ürünlük bir katalogda "200 ürün" yazan
bir ekran kataloğun tamamını gösterdiğini ima eder.

Kalan 3000+ piksellik sekiz ekran **kesik değil**: hepsi elli satırlık, sınırı
kendi yazan listeler (Adım 5 ve 6'da dipnotları konmuştu). Kural şu: uzun bir
sayfa kendi başına bulgu değil — nerede bittiğini söylemeyen bir liste bulgudur.

Sayaçlar (`app` + `components`, `documents/**` hariç): `dark:` **0** ·
`neutral-` **0** · `brand-` **0**.

Doğrulama: `tsc --noEmit` temiz, `next lint` temiz, `vitest run` yeşil,
`next build` başarılı, 64 ekran görüntüsünün tamamı yeniden çekildi (üst şerit
ve marka her ekranda değişti).
