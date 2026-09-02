# Arayüz yoğunluğu raporu — nereye kapanır/açılır bölüm koyalım

Tarih: 2026-08-30 · Kapsam: `apps/web` (70 rota, 203 `.tsx`) · Envanter + ilerleme.

> **Durum — 2026-09-02.** Faz 1–6 ✅ · yoğunluk işi tamamlandı.
> **Ölçüldü:** 3000px üstü ekran **10 → 1**, 2500px üstü **1** (o da portal
> vitrin ve orada uzunluk doğru). Kasa 4538→2126, ürünler 2921→1167,
> hesabım 2025→960. Tam tablo §1.1'de.
> **Son kapanış:** dört ekleme şeridi katlandı; bekleyen 45 `<Note>` kapalı
> başlıyor. Devir ve doğrulama kaydı `docs/design/YOGUNLUK-KALAN.md`de.
> Doğrulama: typecheck + lint temiz, 20 test dosyası / 396 test geçiyor,
> `pnpm build` başarılı, 92 ekran görüntüsü tazelendi ve
> `node scripts/screenshots.mjs --check` **89 ekranın hepsini aynı** buluyor.

Bu rapor bir gözlemi ölçüye çeviriyor: "çoğu ekranda aşırı yoğun yazı var,
kapanır açılır menü lazım". Aşağıda önce **ne kadar** yoğun olduğu sayıyla,
sonra **neden** öyle olduğu altı kök nedenle, sonra **nereye** ne konacağı ekran
ekran yazılı.

---

## 1. Teşhis — ölçü

`docs/design/screens/` altındaki 96 ekran görüntüsü 1440×960 CSS piksel,
ölçek 1 ile çekiliyor (`scripts/screenshots.mjs:40`). Yani PNG yüksekliği =
sayfanın gerçek yüksekliği. Görüntü alanı 960px, üst şerit 64px sabit →
**kullanıcı bir bakışta ~890px görüyor.**

| Sayfa boyu | Ekran | Oran | Anlamı |
| --- | --- | --- | --- |
| ≥ 3000px | 10 | %10 | 3,5+ ekran kaydırma |
| 2000–3000px | 13 | %14 | 2–3 ekran kaydırma |
| 1200–2000px | 20 | %21 | 1,5–2 ekran |
| < 1200px | 53 | %55 | tek ekrana yakın |

**Ortanca sayfa 1087px.** Yani sorun her yerde değil: **23 ekran (%24)**
gerçekten iki ekrandan uzun, geri kalan 73 ekran zaten iyi durumda.
Arkadaşının gördüğü şey bu 23 ekran — ama bunlar günlük kullanılan ekranlar
olduğu için his "her yer yoğun" oluyor.

`docs/design/REDESIGN.md` bu eşiği zaten yazmış:

> "Bir PNG 3000 pikselden uzunsa o ekranda sınırlanmamış bir liste var demektir."

**On ekran hâlâ o sınırın üstünde.** Kural var, uygulanmamış.

### En uzun 12 ekran

| px | Ekran | Dosya |
| --- | --- | --- |
| 4538 | Kasa & banka | `admin/kasa/` |
| 4285 | Stok — hareketler | `admin/stok/_components/movements-panel.tsx` |
| 3942 | Güvenlik (süzgeçli) | `admin/audit/_components/audit-client.tsx` |
| 3935 | Stok — partiler | `admin/stok/_components/lots-panel.tsx` |
| 3747 | Bakım işleri | `admin/jobs/` |
| 3597 | Stok — durum | `admin/stok/_components/stock-levels-panel.tsx` |
| 3450 | Güvenlik kaydı | `admin/audit/` |
| 3420 | Kategoriler | `admin/categories/_components/categories-manager.tsx` |
| 3165 | Pano — kârlılık | `admin/analitik/_components/margin-section.tsx` |
| 3005 | Portal vitrin | `portal/_components/portal-client.tsx` |
| 2998 | Pano — ürün | `admin/analitik/_components/product-section.tsx` |
| 2921 | Ürünler | `admin/products/_components/products-table.tsx` |

### 1.1 Ölçüm — iş bittikten sonra (2026-09-02)

`SHOT_BASE_URL=http://localhost:3100 node scripts/screenshots.mjs --check`
çıktısından; aynı veri, aynı görüntü alanı.

| Ekran | Önce | Sonra | Kısalma |
| --- | --- | --- | --- |
| Kasa & banka | 4538 | **2126** | %53 |
| Stok — hareketler | 4285 | **2061** | %52 |
| Güvenlik (süzgeçli) | 3942 | **1872** | %53 |
| Stok — partiler | 3935 | **1881** | %52 |
| Bakım işleri | 3747 | **1412** | %62 |
| Stok — durum | 3597 | **1503** | %58 |
| Güvenlik kaydı | 3450 | **1380** | %60 |
| Kategoriler | 3420 | **1761** | %49 |
| Pano — kârlılık | 3165 | **1817** | %43 |
| Portal vitrin | 3005 | 3005 | — (aşağıya bak) |
| Pano — ürün | 2998 | **1411** | %53 |
| Ürünler | 2921 | **1167** | %60 |
| Rep — ziyaret | 2621 | **1445** | %45 |
| Kurulum | 2100 | **1209** | %42 |
| Firma detayı | 2050 | **1267** | %38 |
| Hesabım | 2025 | **960** | %53 |
| Sipariş detayı | 1746 | **1332** | %24 |
| Rapor detayı | 1984 | **1674** | %16 |
| Rep — pano | 1634 | **1366** | %16 |
| Hareket akışı | 2589 | **1359** | %47 |

**3000px üstü ekran: 10 → 1. 2500px üstü: 1** — o da portal vitrin, ve orada
uzunluğun sebebi ürün ızgarası, yani sayfanın konusu (§5).

İki düzeltme, ikisi de raporun ilk hâlinin yanıldığı yer:

- **Portal vitrin kısalmadı ve kısalmamalı.** Tahmin ~2400px'ti, gerekçe
  "kenar çubuğu ağacı kapanır" idi. Ölçünce görüldü ki sayfanın boyunu kenar
  çubuğu değil **ürün ızgarası** belirliyor: çubuk zaten `max-h-[28rem]` ile
  sınırlıydı, yani 448 pikselde duruyordu. Izgara sayfanın konusu (§5) ve
  `useVisibleSlice(…, 24)` ile zaten sınırlı. Ağaç yine de kapandı — kazanç
  pikselde değil, elli bir satırlık bir kaydırma kutusunda aranan kategoriyi
  bulmakta.
- **`admin/activity` (hareket akışı, 2589px) listede hiç yoktu.** İlk envanter
  onu görmemişti; yeni boy uyarısı ilk koşuda buldu ve aynı oturumda kapandı
  (`useVisibleSlice(entries, 20)` + `ShowMore`): **2589 → 1359.** Faz 6'nın
  değerinin kanıtı bu satır — kural vardı, ölçü yoktu, ekran gözden kaçmıştı.

---

## 2. Kök nedenler

Altı tane. Üçü tek dosyada çözülüyor, üçü ekran ekran.

### N1 — `Panel` kapanmıyor

`src/components/form.tsx:286`. Panel'in `title` + `icon` + `action` yuvaları
var, **açılıp kapanma yok.** Kod tabanında **129 `<Panel>` kullanımı** var.
Tek bir `collapsible` bayrağı 129 yerin hepsini birden çözülebilir hâle
getiriyor — bu raporun en yüksek kaldıraçlı maddesi.

### N2 — İlk çizim 50 satır

Listelerin ilk dilimi 50. Satır yüksekliği `Td`nin `px-4 py-3`ü ile 44px;
satırda `Button size="sm"` (h-8 = 32px) varsa **56px**. Yani tek bir tablo
tek başına **2200–2800 piksel**.

Yerler: `kasa/_components/movements-panel.tsx:76` · `stok/_components/movements-panel.tsx:59`
· `stok/_components/stock-levels-panel.tsx:45` · `stok/_components/lots-panel.tsx:65`
· `products/_components/products-table.tsx:75` · `deliveries/_components/backorder-panel.tsx:38`
· jobs (son 50 çalıştırma) · audit.

Kasa ekranında ölçtüm: **4538px'in 2517'si (%55) tek tablo.**

`useVisibleSlice` zaten "daha fazla göster" mekanizmasını veriyor
(`src/components/show-more.tsx`) — sadece ilk adım fazla büyük seçilmiş.
Bu **sunucu isteğini değiştirmiyor**, yalnızca çizimi; sıralama ve sayma
tamamı üzerinde çalışmaya devam ediyor (show-more.tsx'in kendi notu).

### N3 — Ağaçlar düz çiziliyor

Kategori ağacı iki yerde de düzleştirilip tek liste hâlinde basılıyor:

- `admin/categories/_components/categories-manager.tsx:40` — `walk()` ağacı
  derinlik sıralı düz diziye çeviriyor.
- `portal/_components/portal-client.tsx` — `CategoryItem` sadece
  `paddingLeft: depth * 10` uyguluyor.

Demo verisinde **34 kök + 17 alt = 51 satır**, hepsi açık. Üstelik yönetim
tarafında her satır bir `<select>` taşıyor: **51 adet açılır kutu** aynı anda
ekranda. Görsel gürültünün büyük kısmı bu.

### N4 — Dipnotlar hep açık

**48 `<Note>` bloğu** var (`src/components/ui.tsx:245`). Çoğu 4–8 satırlık
paragraf ve sayfanın en altında. İçerikleri iyi — `admin/erp/page.tsx`teki not
"ERP'ye hiçbir şey yazılmaz"ı anlatıyor, gerçekten gerekli. Ama **ilk okumada
gerekli, ellinci açılışta gürültü.**

### N5 — Ekleme formları kalıcı olarak açık

"Yeni satır ekle" şeridi listenin üstünde sürekli duruyor:

`categories-manager.tsx` · `customer-groups/_components/groups-manager.tsx:41`
· `payment-terms/_components/terms-manager.tsx` · `documents/_components/series-manager.tsx`
· `volume-tiers/_components/tiers-manager.tsx` · `kasa/_components/accounts-panel.tsx`

Kullanıcı bu formlara ayda birkaç kez dokunuyor, her açılışta görüyor.

**Doğrusu kod tabanında zaten var**, iki yerde:
`products/_components/variant-list.tsx:39` (tek seferde tek varyant açık —
akordiyon) ve `companies/[id]/_components/company-addresses.tsx:22`
(`adding` bayrağı). Bir de `stok/_components/movements-panel.tsx` üç formu
`Chips` ile sıraya sokmuş ve **sebebini de yazmış**:

> "Üçü birden açıkken panelin üstünde on dört kontrollük bir duvar oluşuyor."

Yani karar zaten verilmiş, yayılmamış.

### N6 — Boş paneller yer kaplıyor

Kasa ekranında "Kart tahsilatları" paneli hiç kayıt yokken **~265px**
tutuyor: başlık + durum süzgeci + tablo başlığı + "Bu durumda kart tahsilatı
yok." Rep ziyaret ekranında "Yeni ziyaret" paneli yalnızca "üstteki seçiciden
firma seçin" diyor ve bir panel çerçevesi harcıyor.

---

## 3. Eklenecek parçalar

Dört bileşen + bir tablo kipi. Hepsi mevcut tasarım diline uyuyor
(1px çizgi, gölge yok, sıkı köşe).

### P1 · `Panel` → `collapsible` — ✅ yapıldı

```tsx
<Panel title="Hesaplar" collapsible defaultOpen={false} summary="2 hesap · ₺3.267.046">
```

- Başlık satırı tıklanabilir olur, sağa bir chevron gelir.
- `summary`: kapalıyken başlığın yanında tek satır künye. Kapalı panelin
  "içinde ne var" sorusunu cevaplamayan akordiyon, kaydırmaktan kötüdür.
- Açıklık durumu `localStorage`'da panel anahtarıyla saklanmalı — kullanıcı
  her girişte aynı üç paneli tekrar açmasın.
- `defaultOpen` **varsayılan `true`.** 129 çağrı yerinin hiçbiri bozulmaz;
  yalnızca istenen yerlere `defaultOpen={false}` eklenir.

### P2 · `Disclosure` — panelsiz açılır satır — ✅ yapıldı

Panel çerçevesi istemediğimiz yerler için: form içi ileri düzey alanlar,
tablo altı açıklama, süzgeç şeridi.

```tsx
<Disclosure label="Süzgeçler" badge={aktifSayisi}>…</Disclosure>
```

`badge`: kapalıyken kaç süzgeç etkin. Kapalı bir süzgeç şeridi, gizli
süzgeçle liste kesildiğinde kullanıcıyı yanıltır — sayı bunu önler.

### P3 · `Note` → varsayılan kapalı — ✅ 48/48 çağrı yeri

48 notun tamamı `collapsible defaultOpen={false}` taşıyor; içerik silinmeden
başlık **"Bu ekran nasıl çalışır"** altında kapalı başlıyor. Saklama anahtarı
verilen özel notlar kullanıcının bıraktığı açıklık durumunu `localStorage`da
hatırlıyor.

### P4 · Ağaç düğümü kapanır — ✅ yapıldı

`categories-manager.tsx`teki `walk()` düz dizi yerine iç içe düğüm döndürsün;
kök satırlar varsayılan kapalı, alt sayısı künyede (`3 alt`). Aynı bileşen
vitrin kenar çubuğunda da kullanılır.

Ek olarak: **arama kutusu.** 51 satırlık ağaçta kaydırmanın alternatifi
açmak değil, aramak.

### P5 · `Table` yoğun kip — ✅ yapıldı

`Table`a `dense` (py-3 → py-1.5) ve `Button`a `xs` (h-6). Satır 56px → 40px.

Dolgu `Td`ye değil **tabloya** kondu (`[&_td]:py-1.5`): elli `Td` çağrısını tek
tek gezmek yerine tablo başına tek bayrak, ve bir tablonun yarısının yoğun
yarısının seyrek olması imkânsız hâle geliyor.
50 satırlık tabloda **800 piksel.** Kaydırma azalmıyor ama *aynı ekranda daha
çok satır* görünüyor — ki listelerde istenen bu.

---

## 4. Ekran ekran uygulama listesi

Öncelik: **A** = günlük kullanılıyor + 2000px üstü. **B** = düzenli kullanılıyor.
**C** = seyrek.

### A — önce bunlar

| Ekran | Şimdi | Ne yapılacak | Tahmin |
| --- | --- | --- | --- |
| **Kasa & banka** ✅ | 4538px | İlk dilim 50→20 · "Hesaplar" kapalı, künyede hesap sayısı+bakiye · "Kart tahsilatları" kapalı, künyede kayıt+bekleyen sayısı · elle giriş + aktarım tek `Disclosure` · hesap açma şeridi `Disclosure` · Note kapalı | **~1900px** (ölçüm Faz 3 sonunda) |
| **Stok — hareketler** ✅ | 4285px | İlk dilim 20 (`ShowMore`) · `Chips` şeridi `Disclosure`a girdi · yoğun kip | **~1800px** |
| **Stok — durum** ✅ | 3597px | İlk dilim 20 (`ShowMore`) · yoğun kip + `xs` düğme · `KRİTİK`/`RAF` sütunları boşsa hiç çizilmiyor | **~1600px** |
| **Stok — partiler** ✅ | 3935px | İlk dilim 20 (`ShowMore`) · yoğun kip · satır düğmeleri `xs` | **~1700px** |
| **Ürünler** ✅ | 2921px | İlk dilim 50→20 · süzgeç şeridi `Disclosure` | **~1500px** |
| **Kategoriler** ✅ | 3420px | Ağaç kapanır (51→34 satır) · arama kutusu · satır içi `<select>` yerine "taşı" eylemi (51 açılır kutu → 0) · ekleme şeridi `Disclosure` | **~1400px** |
| **Portal vitrin** ✅ | 3005px | Kenar çubuğu ağacı kapanır · ürün ızgarası **dokunulmuyor** (sayfanın konusu o) | **~2400px** |
| **Pano — kârlılık** ✅ | 3165px | Üç kırılım tablosu (firma/kategori/plasiyer) alt-sekme ya da akordiyon; ilkinde "Firma bazında" açık | **~1700px** |
| **Pano — ürün** ✅ | 2998px | Aynısı | **~1700px** |

### B — sonra

| Ekran | Şimdi | Ne yapılacak |
| --- | --- | --- |
| **Bakım işleri** ✅ | 3747px | "Son çalıştırmalar" (50 satır, %90'ı `OK`) varsayılan kapalı; künye "son 50 · 3 hata". 6 iş kartı zaten iyi. |
| **Güvenlik / denetim** ✅ | 3942 / 3450px | İlk dilim 50→20 · süzgeç şeridi `Disclosure` (4 kontrol) |
| **Firma detayı** ✅ | 2050px | 5 blok var: künye + form + adresler + kullanıcılar + iskonto. **Form** açık; "Ödemede sunulacaklar" ve "Hacim iskontosu" `fieldset`leri (`company-form.tsx:279,344` — ikisi de uzun açıklama paragrafı taşıyor) kapalı. Adresler/kullanıcılar/iskonto kapalı, künyede sayı. |
| **Hesabım** ✅ | 2025px | 5 panel + hareket listesi. **Yalnızca "Profil" açık**; İki adımlı doğrulama, Güvenlik durumu, Şifre değiştir, Son hareketlerim kapalı. Bu ekranda kullanıcı ayda bir kez tek bir iş yapıyor. |
| **Kurulum** ✅ | 2100px | 12 adım, hepsi iki satır açıklamalı. **Tamamlanan adım tek satıra insin** (yeşil tik + ad + sayı), yalnızca eksik adım açık kalsın. 10/10'da ekran 12 satır olur. |
| **Rep — ziyaret** ✅ | 2621px | "Son ziyaretlerim" (15 satır ≈ 900px) kapalı · "Yeni ziyaret" boş paneli tek satıra insin |
| **Sipariş detayı** ✅ | 1746px | Kalem tablosu + özet **dokunulmuyor**. "Durum geçmişi", "İade", "ERP" panelleri kapalı; durum geçmişi künyesinde son durum. |
| **Rapor tasarımcısı** ✅ | — | 7 panel (`report-builder.tsx:359,428,459,588,614,774,865`). "Hesaplanmış sütunlar", "Filtreler", "Sıralama/limit/grafik" kapalı başlasın; "Alanlar" ve "Sütunlar" açık. |

### C — küçük ama ucuz

Aynı kalıbın tekrarladığı ekranlar; her biri tek satırlık değişiklik:

- `customer-groups`, `payment-terms`, `documents` (seri), `volume-tiers`,
  `kasa/hesaplar`: ekleme şeridi → `Disclosure` ("+ Yeni …").
- 48 `<Note>` → `collapsible`, tek seferde.
- Boş panel kuralı: `EmptyState` çizen bir panel kapalı başlasın.

---

## 5. Nereye **KOYMAYIN**

Akordiyon her derde deva değil. Yanlış yere konursa "bir tık daha" vergisi
oluyor ve yoğunluktan kötü.

- **Sipariş kalem tablosu.** Sayfanın konusu o. Kapatılırsa sayfa hiçbir işe
  yaramaz.
- **Portal ürün ızgarası.** Aynı sebep. Burada çözüm `useVisibleSlice(…, 24)`
  ile zaten uygulanmış.
- **`StatTile` satırları.** Zaten tek bakışta okunuyor, 4 kutu ≈ 110px.
- **Giriş / şifre / kayıt ekranları.** Hepsi < 900px.
- **Tek satırlık süzgeç şeritleri.** 1–2 kontrolse açık kalsın; `Disclosure`
  eşiği **3+ kontrol.**
- **Kenar çubuğu grupları — dikkatli.** 36 bağlantı / 7 grup çok görünüyor ama
  gezinmenin işi *nereye gidileceğini göstermek*. Grupları kapatmak, aradığını
  bilmeyen kullanıcıyı kör eder. Buradaki doğru araç akordiyon değil:
  `CommandPalette` (Ctrl+K) zaten var — **öne çıkarılmalı**, menü değil.
  İstenirse yalnızca "Sistem" grubu (9 bağlantı, seyrek kullanılıyor) kapalı
  başlayabilir.

---

## 6. Kalıcı kurallar

REDESIGN.md'ye eklenecek beş satır. Amaç: aynı yoğunluğun geri gelmemesi.

1. **3000px kuralı zaten var, ölçülsün.** `pnpm shots` sonrası PNG boyu 2500px'i
   aşan ekran uyarı versin. Elle bakmak üç adımda üç kez unutuldu.
2. **İlk dilim 15–20 satır.** 50 değil. `useVisibleSlice` varsayılanı `50`'den
   `20`'ye insin (`show-more.tsx:26`).
3. **Bir ekranda en fazla iki panel açık başlar.** Üçüncü ve sonrası
   `defaultOpen={false}` + `summary`.
4. **Kapalı bölüm künyesini taşır.** İçinde ne olduğunu söylemeyen kapalı
   başlık, kaydırmaktan kötüdür.
5. **Açıklama metni katlanır, silinmez.** Notların içeriği projenin en iyi
   yanlarından biri — kısaltmak değil, katlamak lazım.

---

## 7. Sıra

| Faz | İş | Etki | Durum |
| --- | --- | --- | --- |
| 1 | `Panel.collapsible` + `Disclosure` + `Note.collapsible` + `Table dense` + `Button xs` | Hiçbir ekran değişmez, alet hazır olur | ✅ |
| 2 | `useVisibleSlice` varsayılanı 20; uzun tabloların ilk dilimi 20 | En uzun 9 ekran ~%50 kısalır | ✅ |
| 3 | A listesi ekran ekran (`defaultOpen`, `summary`) | 4538px → ~1900px | ✅ |
| 4 | Ağaç bileşeni + kategori araması (yönetim + vitrin) | Kategoriler ve vitrin | ✅ |
| 5 | B ve C listeleri | Kalan ~20 ekran | ✅ |
| 6 | `pnpm shots` + boy uyarısı, REDESIGN.md kural bölümü | Geri gelmemesi | ✅ |

### Faz 1 — ne yapıldı

- **Yeni dosya `src/components/disclosure.tsx`.** Ortak mekanik: `useOpenState`
  (localStorage'da hatırlama), `DisclosureChevron`, `DisclosureBadge`,
  `Disclosure` (P2) ve `CollapsibleNote`.
  Katlanır not neden `ui.tsx`te değil: `ui.tsx` sunucu bileşenlerinde de
  kullanılıyor, durum tutan parça istemci sınırının bu yanında kalmalı.
- **`Panel`** (`form.tsx`): `collapsible`, `defaultOpen` (varsayılan `true`),
  `summary`, `storageKey`. Anahtar verilmezse rota + başlıktan türüyor
  (`panel:/admin/kasa:Hesaplar`) — aynı başlık iki ekranda çakışmasın.
  `action` düğmenin dışında bırakıldı: iç içe iki tıklanabilir eleman hem
  klavyede hem ekran okuyucuda bozuk. Kapalı panelde başlığın alt çizgisi de
  kalkıyor, yoksa sayfada gövdesiz bir çizgi kalıyor.
- **`Note`** (`ui.tsx`): `collapsible` + `title` (varsayılan "Bu ekran nasıl
  çalışır") + `defaultOpen`. **Varsayılan `false`** bırakıldı — Faz 1'in kuralı
  hiçbir ekranın değişmemesi; 48 notu açmak Faz 5'in işi.
- **`Table`**: `dense`. **`Button`/`LinkButton`**: `xs` (h-6).
- Erişilebilirlik üçlüsü baştan uygulandı: `<button aria-expanded>`, kapalı
  içerik DOM'dan çıkıyor, ok `motion-reduce:transition-none` taşıyor.

### Faz 3 — ekran ekran

**Kasa & banka** ✅ — dört panelden ikisi kapalı başlıyor, iki form katlandı:

- `accounts-panel.tsx`: panel `collapsible defaultOpen={false}`, künye
  "N hesap · ₺toplam". Hesap açma şeridi `Disclosure` ("+ Yeni hesap").
  Bakiye ağda **dize** geliyor (ondalık): toplarken `Number()` şart, yoksa
  dize birleşmesi oluyor.
- `card-payments-panel.tsx`: kapalı başlıyor, künye "N kayıt · M bekliyor".
  Durum süzgeci başlıktan gövdeye taşındı — kapalı bir panelin başlığında
  duran süzgeç, neyi süzdüğü görünmediği için yanıltıcı.
- `movements-panel.tsx`: elle giriş + aktarım formları tek bir `Disclosure`
  altında ("+ Elle kayıt / hesaplar arası aktarım").
- `page.tsx`: `Note collapsible defaultOpen={false}`.

**Stok — üç panel** ✅ — hepsi tek sekmede (`stock-workbench`):

- `movements-panel.tsx`: `Chips`li form şeridinin tamamı `Disclosure`a girdi
  ("+ Hareket kaydet"). `Chips` üç formu bire indirmişti ama o bir form da
  defterin üstünde sürekli duruyordu; defteri okumak kayıt girmenin kaç katı
  yapılıyorsa varsayılan o olmalı. Tablo yoğun kipte.
- `stock-levels-panel.tsx`: yoğun kip + satır düğmesi `xs`. **Boş sütun
  çizilmiyor:** kritik seviye ve raf kodu isteğe bağlı alanlar, hiçbir ürüne
  girilmemişse tablo iki sütun boyunca "—" basıyordu.
- `lots-panel.tsx`: yoğun kip, satır düğmeleri `xs`.

Ölçüm (`pnpm shots`) veritabanı + geliştirme sunucusu istiyor; Faz 3'ün
sonunda A listesinin tamamı için tek seferde alınacak.

### Faz 3 — kalan beş ekran

- **Ürünler**: tablo yoğun kipte. Süzgeç şeridi **bilerek katlanmadı** — üç
  kontrol `Disclosure` eşiğinde ama iki bin altı yüz ürünlük bir katalogda arama
  kutusu ekranın *aleti*, dipnotu değil. Kırk piksel kazanıp her ziyarete bir
  tık eklemek kötü takas.
- **Pano — kârlılık**: üç kırılımdan yalnızca "Firma bazında" açık; diğer ikisi
  künyede satır sayısı + tepedeki marjla kapalı. "Aylık kârlılık" da kapalı —
  köprü ile aynı soruyu zaman ekseninde soruyor. Marj köprüsünün notu katlandı.
- **Pano — ürün**: ABC tablosu açık kaldı (ekranın konusu o), yoğun kipe geçti
  ve ilk dilimi `useVisibleSlice(…, 15)` ile onbeşe indi — Pareto'nun A sınıfı
  zaten o aralıkta. "Ölü stok" kapalı, künyede "N varyant · ₺X".

### Faz 4 — ağaç bileşeni

**Yeni dosya `src/components/category-tree.tsx`.** Paylaşılan şey **çizim
değil, karar**: hangi düğüm görünür, hangisi açık, arama neyi eliyor. İki
ekranın görüntüsü farklı (biri `<tr>`, biri `<li>`) ama bu üç sorunun cevabı
aynı olmak zorunda.

- `nestByParent()` düz `parentId` listesini iç içe düğüme çeviriyor; üstü
  listede olmayan satır **düşürülmüyor, köke ekleniyor** (yoksa düzenlenemez
  bir kategori kalırdı).
- `useCategoryTree()` arama + açıklık durumunu tutuyor, çıktısı düz satır
  listesi. Açıklık `localStorage`da (`b2b.tree.<anahtar>`), ilk çizimden sonra
  uygulanıyor — hidrasyon kuralı `disclosure.tsx`teki ile aynı.
- **Aramanın ağaçtaki karşılığı özel.** Eşleşen düğümün *ataları* görünür
  kalıyor, yoksa sonuç bağlamsız bir isim listesi olurdu ("Kutu" — neyin
  altındaki kutu?). Eşleşen düğümün *altındaki* her şey de görünür kalıyor,
  yoksa arama ağacı düzleştirirdi. Arama sürerken kayıtlı açıklık yok sayılıyor:
  kapalı bir dalın içindeki eşleşmeyi saklamak aramanın kendisini bozar.
- Türkçe katlama (`toLocaleLowerCase("tr")`): "İstanbul" araması "istanbul"
  yazınca da bulmalı.

**Kategoriler ekranı**: ağaç kapanır, arama kutusu + "tümünü aç/kapat", tablo
yoğun kipte, ekleme şeridi `Disclosure`. **Satır içi `<select>` sütunu tamamen
kalktı** — elli bir açılır kutu yerine satırda "Taşı" düğmesi ve tek bir pencere.
Pencere kendi alt ağacını seçeneklerden eliyor: bir dalı kendi çocuğunun altına
taşımak ağacı döngüye sokar. Sunucu bunu zaten reddediyor ama reddedilecek bir
seçenek sunmanın anlamı yok.

**Vitrin kenar çubuğu**: aynı kanca, arama kutusu, kapalı dalın yanında alt
sayısı. Ok satırın **dışında** ayrı bir düğme — iç içe iki tıklanabilir eleman
hem klavyede hem ekran okuyucuda bozuk, ve ayrılmasının ikinci faydası davranış:
"Ambalaj"ı açmakla "Ambalaj"a süzmek iki ayrı istek.

### Faz 5 — B listesi

- **Bakım işleri**: "Son çalıştırmalar" kapalı, künye `son 50 · 3 hata`; ilk
  dilim 20, tablo yoğun. `useVisibleSlice` erken dönüşlerin **üstüne** taşındı —
  koşullu çağrılamaz.
- **Güvenlik / denetim**: beş kontrollük süzgeç şeridi `Disclosure`, künyede
  etkin süzgeç sayısı. Süzgeçli bir adresle gelindiğinde **açık başlıyor**,
  yoksa kullanıcı listenin neden kesildiğini göremezdi. Sunucu limiti 50 kaldı,
  çizim 20'ye indi (Faz 2'nin dersi).
- **Firma detayı**: iki `fieldset` katlandı (yeni `CollapsibleFieldset` —
  `<fieldset>`/`<legend>` korunuyor, düğme `<legend>`in içinde; onay kutusu
  kümelerinde bu ikili ekran okuyucuya "bu dört kutu tek soruya ait" diyen tek
  şey). Adresler, hesaplar ve iskontolar kapalı, künyede sayı. `UserManager`a
  `collapsible` bayrağı eklendi — kendi sayfasında ekranın tamamı, firma
  detayında beş bloktan biri.
- **Hesabım**: yalnızca "Profil" açık. Bildirimler, güvenlik durumu, şifre
  değiştir, son hareketler kapalı. İki adımlı doğrulama **zorunluysa açık**
  kalıyor: uyarının kapalı bir başlığın arkasında durması, kullanıcının diğer
  ekranlara neden giremediğini saklardı.
- **Kurulum**: tamamlanmış adım tek satıra indi (tik + ad + sayı + kısa yol).
  Sorunlu adım istisna — orada tam metin hâlâ gerekli. Sektör paketi paneli
  kurulum bittiyse kapalı: bir başlangıç aleti, kalıcı bir ayar değil.
- **Rep — ziyaret**: firma seçilmemişken "Yeni ziyaret" panelinin tamamı tek bir
  cümle taşıyordu; artık düz bir satır. Ziyaret geçmişi kapalı.
- **Sipariş detayı**: kalem tablosu ve özet **dokunulmadı**. Durum geçmişi, iade
  ve ERP kapalı; geçmişin künyesi son adımın tarihini taşıyor.
- **Rapor tasarımcısı**: "Alanlar" ve "Sütunlar" açık; hesaplanmış sütunlar,
  filtreler ve sıralama/limit/grafik kapalı. İlk ikisi doluysa açık başlıyor —
  kayıtlı bir raporu açan kişi neyin ayarlı olduğunu görmeli.

### Faz 5 — C listesi

- **Yeni kayıt şeritleri**: müşteri grubu, vade, belge serisi ve hacim basamağı
  formları `Disclosure` içine alındı. Dört ayrı `storageKey` kullanılıyor;
  oluşturma hatası kapalı şeridin dışında sahipsiz kalmıyor.
- **Açıklama notları**: daha önce katlanan 3 çağrıya kalan 45 çağrı da eklendi;
  toplam 48/48 `Note` içeriği korunarak kapalı başlıyor. Sunucu sayfalarında ek
  sarmalayıcı gerekmedi; mevcut `Note` → `CollapsibleNote` istemci sınırı üretim
  derlemesinden geçti.

### Faz 6 — geri gelmemesi

- `scripts/screenshots.mjs`e `TALL_LIMIT = 2500` ve koşu sonunda uzundan kısaya
  sıralı bir döküm. **Süreç durdurulmuyor**: bazı ekranların uzun olması doğru
  (kalem tablosu, ürün ızgarası). Uyarı bir kural değil bir ölçü — elle bakmak
  üç adımda üç kez unutuldu.
- `docs/design/REDESIGN.md`ye "Yoğunluk kuralları" bölümü: beş kural, "nereye
  koymayın" listesi ve erişilebilirlik üçlüsü.
- **Aynı ekrandaki iki not aynı başlığı alamaz.** 48 notun tamamı katlandığında
  ERP ekranında iki, pano müşteri sekmesinde **dört** not birden "Bu ekran nasıl
  çalışır" diyordu; kapalıyken hangisinin ne anlattığı okunmuyordu — §6'nın
  dördüncü kuralının ("kapalı bölüm künyesini taşır") tam ihlali. Beşine ayrı
  başlık verildi: "Segmentler nasıl hesaplanıyor", "Kohort matrisi nasıl
  okunur", "Sessizleşen nasıl belirleniyor", "Panonun kaynağı ve kıyas kuralı",
  "Köprü nasıl çalışır", "Bu iki komut ne yapar".
- **`DIFF_TOLERANCE` ölçülerek yeniden seçildi: 0,001 → 0,0025.** Beş ekran
  köşesinde zaman damgası taşıyor ve o tek satır iki koşu arasında %0,11–0,14
  oynatıyor; bu işteki gerçek düzen değişiklikleri ise %0,63–11,9 aralığında
  ölçüldü. Yeni eşik ikisinin arasında.
- **`--check` muafiyeti iki ekran büyüdü.** Denetim kaydı ve hareket akışı saat
  basıyor, üstelik denetim kaydı *çekim betiğinin kendi girişlerini* satır
  olarak yazıyor: iki ardışık koşu bile eşit çıkmıyor (%3,8 ve %1,3 ölçüldü).
  İkisi de `CHECK_EXEMPT`e girdi — "her zaman kırmızı" ile "hiç bakılmıyor"
  arasında fark yok, ve o iki dosya kalan seksen dokuzun kırmızısını
  görünmez kılıyordu.

### Faz 2 — ne yapıldı

- `useVisibleSlice` varsayılanı **50 → 20** (`show-more.tsx`).
- İlk dilimi 20'ye inenler: ürünler, kasa hareketleri, eksik teslimat kalemleri.
- **Düzeltme — raporun ilk hâli burada yanılıyordu.** Stok panellerindeki
  `PAGE_SIZE = 50` bir *çizim* dilimi değil, **sunucudan istenen satır sayısı**
  (`?limit=50`). Onu 20'ye indirmek "SKT'si en yakın 20 parti" demek olurdu ve
  kullanıcının gerisini görmesinin tek yolu süzgeç kalırdı. Doğrusu: istek 50
  kaldı, çizim `useVisibleSlice(rows, 20)` ile 20'ye indi ve panelin altındaki
  düz "ilk 50 satır gösteriliyor" cümlesi `ShowMore`la değişti — artık hem
  "20 / 50" sayısını hem de sunucu tavanına değildiyse uyarısını veriyor.
  Üç panel: stok durumu, partiler, stok hareketleri.

Faz 1 ve 2 tek oturumluk iş ve tek başlarına en uzun ekranların yarısını
çözüyor. Fazlar 3–5 ekran başına 10–30 satır.

---

## 8. Kapsam dışı

- **Mobil (`apps/mobile`, 21 ekran).** Ayrı bir tarama gerekiyor; oradaki
  yoğunluk sorunu farklı (ekran dar, tablo yok, kart var).
- **Belge ekranları (`app/documents/**`).** Yazdırma çıktısı; katlanır bölüm
  kâğıda basılmaz, dokunulmamalı.
- **Yazı ölçeği ve renk.** Kontrol edildi, sorun değil: `body-sm` 14/20,
  `body-md` 16/24 — standart. Sorun *ne kadar çizildiği*, nasıl çizildiği değil.

---

## Ek — erişilebilirlik notu

Akordiyon eklerken üç şey zorunlu, yoksa klavye kullanıcısı için ekran
kötüleşir:

- Başlık `<button aria-expanded>` olmalı, tıklanabilir `<div>` değil.
- Kapalı içerik DOM'dan **çıkarılmalı** (`{open && …}`), `hidden` ile
  saklanmamalı — saklanan içerik hâlâ sekme sırasında.
- `prefers-reduced-motion` açıkken açılma animasyonu olmasın. Projede bu
  kural zaten var (`auth-stage.tsx`), aynı yaklaşım.
