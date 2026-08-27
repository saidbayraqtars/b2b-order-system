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
`Button`, `LinkButton`, `Panel`, `Modal`, `ErrorLine`

`src/components/app-sidebar.tsx`
: `SidebarShell` — uygulamanın tek kabuğu. `groups` (başlıksız grup = düz
liste), `search` (üst şeritteki arama kutusu), `actions` (sağdaki düğmeler).

**Sayfa boşluğu kabuktan geliyor** (`px-4 py-6 md:px-10 md:py-8`). Ekranlar
kendi `px-4 py-6`sını yazmaz; yalnızca `mx-auto max-w-*` ile genişlik seçer.

---

## Ekran görüntüsü kuralı

Bir adım bittiğinde o adımın ekranları `docs/design/screens/adim-<n>/` altına
çekilir. Elle değil: ekranı `scripts/screens.mjs` kayıt defterine bir satır
olarak ekleyip `pnpm shots -- --step <n>` çalıştırın. Ayrıntı ve kararlar
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

### ▢ Adım 7 — Rapor tasarımcısı ve panolar

`reports/**`, `admin/reports`.

### ▢ Adım 8 (kalan) — Hesap ekranları

`hesabim`, `403`. `login`, `kayit` ve `sifremi-unuttum` yukarıda bitti.

### ▢ Adım 9 — Mobil

`apps/mobile` — aynı palet ve tipografi. NativeWind'in bilinen iki tuzağı için
`b2b-theme-engine` hafıza notuna bakın.

### ▢ Adım 10 — Temizlik

- Kalan ham sınıfları anlamsala çevir. Sayaç: Adım 1 sonrası `dark:` 506,
  `neutral-` 1033, `brand-` 90 → Adım 2 sonrası 348 / 792 / 46 → Adım 3 sonrası
  237 / 434 / 20 → Adım 4 sonrası 191 / 366 / 18 → Adım 5 sonrası 159 / 318 / 15
  → Adım 6 sonrası **83 / 186 / 13**. Hedef: üçü de sıfır — `documents/**`
  hariç, orada ham `neutral-` bilerek duruyor (bkz. Adım 5).
- Kiracı marka adını kabuğa bağla: `loadTenant()` →
  `seller.tradeName ?? seller.legalName`, `SidebarShell`'in `brand` prop'una.
  Şu an sabit "B2B Portal". `loadTenant()` `TENANT_DIR` yoksa fırlattığı için
  sunucu tarafında yakalanıp yedeğe düşen küçük bir yardımcı gerekiyor.
- Genel arama (Ctrl+K): ürün, firma, sipariş no tek kutudan.
