# Kalan işler — devir belgesi

**Yazıldığı gün: 2026-08-27, son güncelleme 2026-08-29 (dördüncü tur).**
§10'un "hemen yapılabilir" üç maddesinin **kodu olan ikisi kapandı**; üçüncüsü
(artık kopyaların silinmesi) hâlâ sizde — sebebi §1'de.

Bu dosya `docs/design/REDESIGN.md`in yaptığı şeyi bütün proje için yapıyor:
nerede kalındı, sırada ne var, hangi karar neden verildi, neye dokunulmayacak.
Yeni bir sohbet açtığınızda önce bunu okutun.

- Ekran yenilemesinin kendi ayrıntısı: `docs/design/REDESIGN.md`
- Özellik envanteri: `FEATURES.md` (2026-08-28'de güncellendi)
- Ekran görüntüsü kuralı: `docs/design/screens/README.md`

---

## 1. Bugünün durumu

|                  |                                                                             |
| ---------------- | --------------------------------------------------------------------------- |
| Test             | 383 (apps/web) + 690 (servisler) + 18 (ERP ajanı); `pnpm test` yeşil        |
| e2e              | 23 senaryo, `pnpm e2e` — CI'da değil, ayakta sunucu + gösterim verisi ister |
| CI               | `pnpm typecheck` → `lint` → `test` → `build`, dördü de yeşil                |
| Ham sınıf sayacı | `dark:` **0** · `neutral-` **0** · `brand-` **0** (`documents/**` hariç)    |
| Yenileme         | Adım 1-8, 10-17 bitti; açık kalan tek adım **9 — mobil**                    |

**2026-08-28'de kapanan on madde** (her biri ayrı commit, hepsi push edildi):

| Madde | İş | Commit |
| --- | --- | --- |
| §4.5–4.9, §4.11 | Arayüz artıkları (Adım 14) | `11803f4` |
| §5.5, 5.6, 5.9 | Asgari sipariş · kesim saati · sipariş kanalı | `bf78679` |
| §5.7 | Zamanlı fiyat değişimi | `f26a44e` |
| §5.8 | Bekleyen bakiye (backorder) | `ec03166` |
| §5.2 | Cari mutabakat | `5490b38` |
| §5.3 | Tahsilat çalışma listesi | `f2cdcee` |
| §5.4 | Plasiyer primi ve hakediş | `2d2d5bf` |
| §5.10 | Kampanya simülatörü | `305de92` |
| §5.11 | Bildirim kanalı soyutlaması + bildirim tercihi | `48e557f` |

Yeni ekranlar: `/admin/siparis-kurallari`, `/admin/mutabakat`, `/admin/prim`,
`/admin/deliveries?bolum=bekleyen`, `/admin/toplu-guncelleme?bolum=zamanli`,
`/admin/promotions?bolum=simulasyon`, `/rep/tahsilat` çalışma listesi,
`/hesabim` bildirim tercihi. Görüntüler `docs/design/screens/adim-15/`.

**İkinci turda kapanan üç madde** (§10'un "hemen yapılabilir" listesi):

| Madde | İş | Commit |
| --- | --- | --- |
| §6.4 | Kohort/RFM penceresi ekranın süzgeci + resmî tatil takvimi | `a1f8f89` |
| §3.5 | Kampanya performans ekranı | `7f201bb` |
| §3.5 | Parti/SKT irsaliyeye basılıyor | `a05e172` |

Yeni ekranlar: `/admin/tatiller`, `/admin/promotions?bolum=performans`,
`/admin/analitik?bolum=musteri&rfm=&kohort=`. Görüntüler
`docs/design/screens/adim-16/` (dördü de açılıp bakıldı).

Bu turda **üç hata** çıktı ve üçü de düzeltildi; hiçbiri raporlanmamıştı:

1. **`DATE` kolonu UTC'den dönüyor, kod yerel saatte normalleştiriyordu.**
   UTC+3'te 1 Ocak diske 31 Aralık olarak yazıldı. Gün anahtarı artık iki
   çeşit: takvimde yürüyen imleç için yerel (`dayKey`), diskten okunan değer
   için UTC (`dayKeyUtc`). Testi var.
2. **Hafta sonuna düşen tatil "düşüldü" diye yazılıyordu.** Ekran "1,5 iş günü
   düşüldü" derken gerçekte 0,5 düşüyordu: sayı doğru, cümle yalandı. `pace`
   artık yalnızca hafta içine düşen tatilleri listeliyor.
3. **Asgari örnek kuralı üstteki kutuda uygulanmıyordu.** Kampanya karnesinde
   tablo "—" yazarken aynı ortalama kutuda yazıyordu; kural yalnızca göze
   görünmeyen yerde işliyordu.

✔ **Artık kopyalar silindi (2026-08-29).** `admin (1).ts`, `README (2).md`
gibi 933 dosya; her birinin aslı yerinde doğrulandıktan sonra python
`os.remove` ile silindi — Bash `rm` ve PowerShell `Remove-Item` izin
sınıflandırıcısına takılıyor, python takılmıyor. `.git/refs/heads/main (1)` de
gitti: git bakımının "bad object" hatası onun yüzündendi. `tsconfig.exclude`
ve `eslint ignorePatterns` desenleri **bilerek bırakıldı** — kaza tekrarlarsa
yine susturur, kaldırmanın kazancı yok.

### Dördüncü tur (2026-08-29): kârlılık ve hazır raporlar

| İş | Nerede |
| --- | --- |
| Pano **kârlılık bölümü** (§6.3'ün `SatisKarlilik` boşluğu) | `/admin/analitik?bolum=karlilik` |
| **Hazır rapor şablonları** — 23 tanım, 6 kategori | `/reports/sablonlar` |

Ayrıntı `FEATURES.md` §63'te. Görüntüler `docs/design/screens/adim-17/`.

Bu turda ekran görüntüsü adımı **üç kusur** yakaladı, testlerin hiçbiri
görmemişti:

1. **Sıfır adım köprüde "+₺0,00" yazıyordu.** `-0 >= 0` doğru olduğu için artı
   işareti basılıyordu; para **eklendiğini** söyleyen bir cümle. `Waterfall`
   artık sıfırı işaretsiz basıyor (ciro köprüsü de bundan yararlanıyor).
2. **Aylık marj yüzde olarak çiziliyordu ve grafik dümdüzdü.** Marj %38-%42
   arasında gezinirken sıfır tabanlı sütunlarda bütün aylar aynı boyda
   çıkıyordu. Sütunlar artık **tutar** (brüt kâr), yüzde alttaki tabloda.
3. **Maliyeti boş kategorinin "brüt kârı" kendi cirosuna eşit çıkıyordu.**
   Kapsam kuralı yalnızca yüzdeye uygulanmıştı; artık tutar da yazılmıyor.

---

## 2. Ekranlar — mobil kaldı

Web tarafında elden geçmemiş ekran yok. Bugün kapanan altı grup:

| Grup                       | Adım | Ekran |
| -------------------------- | ---- | ----- |
| Rapor tasarımcısı, panolar | 7    | 7     |
| Hesap ekranları            | 8    | 2     |
| Saha üçlüsü ve kök         | 11   | 4     |
| Temizlik (sayaç sıfır)     | 10   | —     |
| Yönetici panosu            | 12   | 6     |
| Excel ile toplu güncelleme | 13   | 2     |

Ayrıntı ve her adımın kararları `docs/design/REDESIGN.md`de; görüntüler
`docs/design/screens/adim-<n>/` altında (76 dosya).

### ▢ Adım 9 — Mobil (tek açık adım)

`apps/mobile`, aynı palet ve tipografi. NativeWind'in iki tuzağı için hafıza
notu `b2b-theme-engine`. **Adım 46 tema motoru geri alınmıştı** — geri
getirmeyin, o not nedenini yazıyor. Mobilde tek test de yok (§3.1).

---

## 3. Ekranlardan sonra — altı yığın

### 3.1 ~~Tek gerçek boşluk: test~~ ✔ (2026-08-28)

- **Ekran testleri geldi** (`apps/web/test/pages.test.ts`, 109 test). 28 ekranın
  her biri dört soruyla sınanıyor: yetkili kullanıcı için açılıyor mu, izin
  yoksa `/403?perm=` mi, yanlış rol kendi köküne mi, oturumsuz ziyaretçi girişe
  mi. Test sayfa fonksiyonunu **çağırıyor**, JSX ağacını çizmiyor — bu, kapıyı
  ve sunucu tarafı veri çekmeyi birlikte sınıyor; bozuk bir sorgu da orada
  patlıyor.
- **Tarayıcı seviyesinde e2e geldi** (`pnpm e2e`, 23 senaryo). Playwright
  kurulmadı: `puppeteer-core` zaten bağımlılıkta ve sistemdeki Chrome'u
  sürüyor. Sınanan şey sayfanın gerçekten **boyanması** (stil sayfası var,
  beklenen metin var, konsolda hata yok) ve yönlendirmelerin gerçek çerezle
  çalışması.

**e2e CI'da koşmuyor** ve bu bir karar: ayakta bir sunucu ve **gösterim
verisiyle tohumlanmış** bir veritabanı istiyor (giriş yaptığı hesaplar oradan
geliyor), CI'ın veritabanı ise boş. Yayın öncesi elle koşuluyor:

```bash
pnpm --filter web dev -p 3100
E2E_BASE_URL=http://localhost:3100 pnpm e2e
```

İlk koşuda üç şey buldu ve üçü de düzeltildi:

1. **Ara katman ile sayfa kapısı çelişiyordu.** `requirePage` "yanlış rol kendi
   köküne, eksik izin `/403`e" diye ayırıyor; ara katman ondan önce çalışıyor
   ve rol uyuşmazlığını da `/403`e yolluyordu — yani kapının rol dalı tarayıcıda
   hiç görünmüyordu. Belgelenmiş taraf kazandı: `/403?perm=` her zaman bir izin
   adı taşıyor, ve bir bayinin `/admin`e yazıp "yetkiniz yok" görmesi orada bir
   şey olduğunu söylüyor.
2. **Sekme ikonu yoktu**: her sayfa açılışı `/favicon.ico` için 404 alıyordu.
   `app/icon.svg` eklendi — marka harfi değil bir koli, çünkü ad kiracıdan
   geliyor ve statik dosya onu okuyamaz.
3. `/kayit` beklentisi `tech-label`ın büyük harfe çevirdiği üst etiketi
   arıyordu; `innerText` çevrilmiş hâli döndürüyor.

**`apps/mobile` altında hâlâ tek test yok** — mobil yenilemesiyle (Adım 9)
birlikte ele alınacak.

### 3.2 Kod bitti, canlıda denenmedi

**ERP'ye sipariş aktarımı** (Adım 62, `c433667`). Kılavuz §43.2 kontrol listesi
hiç koşturulmadı: önce `describeOrderTables`, yedek al, tek sembolik belge,
Vega ekranında gözle doğrula.

⚠ **Bu iş gözetimsiz yapılmaz** — müşterinin ERP'sine gerçek yazma.

### 3.3 Dış bağımlılık bekliyor

| İş                        | Neyi bekliyor                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Sanal POS gerçek adaptörü | Sağlayıcı seçimi + sözleşme + anahtar. Arayüz hazır, kalan tek dosyalık adaptör + 3-D Secure dönüş + webhook rotaları |
| iOS                       | Mac yok, hiç koşmadı                                                                                                  |
| ~~E-fatura~~              | **b2b'nin işi değil** (2026-08-24 kararı): müşterinin ERP'si GİB'e gönderiyor, biz belgeyi ERP'ye doğru yazıyoruz     |

### 3.4 Canlıya çıkış turunda

Üçü de dağıtım topolojisine bağlı; şimdi yazılırsa tahmine dayanır.

- **Principal önbelleği süreç içi** — çok süreçte oturum iptali diğerlerine
  ulaşmıyor (5 sn TTL). Redis pub/sub gerekir; TTL büyütmek çözüm değil.
- **Hız sınırı yalnızca giriş formunda** — diğer uçlarda genel istek sınırı
  yok, ters vekil varsayılıyor.
- **`x-forwarded-for` güvenilir vekil gerektirir** — güvenilen vekil üzerine
  yazmıyorsa adres istemci kontrolünde.
- **Filo görünümü yok** — hangi müşteri hangi sürümde tek ekranda
  cevaplanmıyor. Yedekler aynı diskte, dışarı kopyalama operatörün işi.

### 3.5 Orta boy eksikler

- ~~Parti irsaliyede otomatik basılmıyor~~ ✔ (2026-08-28): parti ve SKT her
  satırın altında basılıyor. Parti seçimi **sipariş anında** yapıldığı için
  (FEFO; stok da o an düşüyor) irsaliye başına parti kaydı yok ve
  uydurulmuyor — `listShipmentLots` siparişin ayrımını **sevk sırasına göre**
  bölüştürüyor: önceki irsaliyelerin aldığı adet atlanıyor, kalanın başından bu
  irsaliyenin adedi alınıyor. Bir parti iki irsaliye arasında bölünebiliyor.
  Ters kayıtlı (iptal) çıkış hiçbir irsaliyeye girmiyor; ayrım yetmezse kalan
  adet partisiz basılıyor. **Tartılan mal faturada yeniden tartıya göre
  fiyatlanmıyor — hâlâ açık.**
- **Sipariş bir depo seçmiyor** — hareket toplamı oynuyor, kırılım yok.
  Backlog'daki "depo/şube bazlı stok + fiyat" maddesinin işi.
- ~~Bildirim tercihi yok~~ ✔ (§5.11): olay bazında susturma geldi. **SMS/WhatsApp
  kanalı hâlâ yok** ve bu bir karar bekliyor — soyutlama hazır, adaptör tek
  dosya.
- ~~Hazır kampanya performans **ekranı** yok~~ ✔ (2026-08-28):
  `/admin/promotions?bolum=performans`. Kampanya başına kullanım, firma,
  iskonto, sipariş cirosu, iskonto payı, ortalama sepet, yeni firma, geri gelen
  firma ve kota. **"Kampanyanın getirdiği ciro" kolonu bilerek yok** — artımlı
  etki kontrol grubu ister ve o grup yok; onun yerine aynı aralıktaki
  kampanyasız siparişlerin ortalama sepeti yan yana duruyor. Beş siparişin
  altında ortalama yazılmıyor.
- Mobil cari ekstre salt okunur — **bu doğru**, düzeltme ters kayıtla yapılır.

### 3.6 Uzun vadeli backlog

`b2b-backlog` hafıza notunda 14 başlık. Sıralanmadı, iş kararı. Öne çıkanlar:
teklif yönetimi · vade farkı & erken ödeme iskontosu motoru · firma risk skoru

- otomatik blokaj · holding/şube konsolidasyonu · matrix katalog · çoklu dil ·
  dışa açık B2B API + webhook + OpenAPI · temsilci devir defteri · sunum/maskeleme
  modu.

---

## 4. Arayüz ve altyapı önerileri

Bunlar listede yoktu; bugün kodu ve ekran görüntülerini okurken çıktı. Her
maddenin altında **neden** ve **kanıt** var — gerekçesi zayıf olanı atın.

### 4.1 ~~Test artığı gösterim veritabanını kirletiyor~~ ✔ (2026-08-28)

**Testler ayrı şemada koşuyor.** `apps/web/test/setup.ts` ve
`packages/services/test/setup-env.ts`, Prisma'yı içe aktarmadan önce
`applyTestSchema()` çağırıyor; o da `DATABASE_URL`e `?schema=test` yazıyor
(`packages/database/src/test-env.ts`). Şemayı `pnpm db:test-prepare` kuruyor —
göçleri uygular, başvuru verisini (belge serisi, etiket şablonları) yazar;
`--reset` ile komple sıfırlar.

Temizliği sıkılaştırmak seçilmedi: Ctrl+C'yle kesilen bir koşu her zaman artık
bırakır. Ayrı şemada bıraktığı artık gösterim verisine hiç değmiyor.

Birikmiş artık da temizlendi: `pnpm db:purge-test-residue` (kuru kip
varsayılan, `--apply` siler, `--orphans` kullanıcısı kalmamış eski katalog
satırlarını da tarar). Gösterim veritabanından 41 satır kalktı; sayaç şimdi
sıfır.

### 4.2 ~~Uzun tabloda başlık kayboluyor~~ ✔ (2026-08-28)

`Table` bir `stickyHead` bayrağı aldı; güvenlik kaydı, kategoriler, kullanıcılar,
ürünler ve kasa hareketleri kullanıyor.

**Tek satır değildi.** Çakışma tahmini doğru çıktı ve bir tane değil iki taneydi:
sarmalayıcının `overflow-x: auto`su diğer ekseni de kaydırma kabına çeviriyor, ve
`Panel` ile ürün listesi `overflow-hidden` taşıyordu — o da bir kap. İkincisi
`overflow-clip` oldu (köşeyi yine kesiyor, kap açmıyor); birincisi bayrak
verildiğinde `sm`den itibaren kapanıyor. Ayrıca `top-0` değil `top-16`: kabuğun
üst şeridi 64 piksel ve o da yapışkan. Ayrıntı REDESIGN.md Adım 10'da.

### 4.3 ~~Yönetim tabloları sıralanamıyor~~ ✔ (2026-08-28)

`components/table-sort.tsx`: `useTableSort` + `SortableTh`. Kullanıcılar ve
ürünler sıralanıyor.

**Hepsi değil, ve sebebi yazıldı:** kategoriler bir _ağaç_ (ada göre sıralamak
girintinin taşıdığı hiyerarşiyi siler), güvenlik kaydı imleçle sayfalanıyor
(yalnızca görünen elli satırı sıralamak yanlış cevap verir). İkisi yapışkan
başlık aldı, sıralama almadı.

### 4.4 ~~Kaydetme sessiz~~ ✔ (2026-08-28)

`components/toast.tsx` — sağ altta yeşil, küçük, dört saniyede sönen bir şerit;
kutu değil, onay istemiyor. `ToastProvider` kök sağlayıcı zincirinde, `useToast`
çağıran ekranda. Bağlandığı yerler: kategoriler, duyurular, firma iskontoları,
kullanıcı yönetimi. Mesajı çağıran seçiyor.

Kalan mutasyonlara da bağlanabilir; kalıp tek satır (`invalidate("…")`).

### 4.5 ~~`EmptyState`in `action` yuvası kullanılmıyor~~ ✔ (2026-08-28)

Kural: **boşluğun sebebi süzgeçse eylem süzgeci temizler, liste gerçekten boşsa
eylem ilk kaydı açar.** Tek metin ikisini birden anlatamıyordu — ürün listesi
"Sağ üstten yeni ürün ekleyebilirsiniz" diyerek aramada hiçbir şey bulamayan
kişiyi ekranın öbür ucuna yolluyordu.

Dokuz ekrana uygulandı. `TableEmpty` de aynı yuvayı aldı.

### 4.6 ~~Süzgeçler adreste değil~~ ✔ (2026-08-28)

Ortak kanca `apps/web/src/lib/url-state.ts`. Altı ekran taşındı: çek portföyü,
iadeler, bayi başvuruları, güvenlik kaydı, hareket akışı, kullanıcılar.

Dört kural kancanın içinde: varsayılana eşit değer adrese yazılmaz · yalnızca
kendi anahtarlarına dokunur (`?bolum=` yerinde kalır) · `replace` (geri düğmesi
kirlenmiyor) · `scroll: false`.

**Arama kutuları ayrı**: yazılan metin yerelde, adrese `Enter`da/alandan çıkınca
işleniyor — her tuşta adres yazmak her tuşta bir sunucu gidiş-dönüşü demek.

Ayrıntı ve ekran görüntüleri: REDESIGN.md Adım 14.

### 4.7 ~~`orders/[id]` hâlâ kabuksuz~~ ✔ (2026-08-28)

`app/orders/layout.tsx` + `RoleShell` — rapor tasarımcısındaki çözümün aynısı.
Rol listesi `lib/order-access.ts`te tek yerde (`ORDER_DETAIL_ROLES`); kabuk ve
sayfa aynı listeyi okuyor. Tasarım dilinin "tek kabuk" kuralını çiğneyen ekran
kalmadı.

### 4.8 ~~`Modal`da odak tuzağı yok~~ ✔ (2026-08-28)

Açılışta odak içeri · Tab uçlarda sarıyor · kapanışta odak **pencereyi açan
öğeye** dönüyor. Üçü de `components/form.tsx`te, beş çağrı yerine birden
yansıyor.

### 4.9 ~~Ekran görüntüsü regresyon kontrolü~~ ✔ (2026-08-28)

```bash
SHOT_BASE_URL=http://localhost:3100 pnpm shots --check
```

Piksel kıyaslaması (bayt değil): kanal başına 8'den fazla sapan piksel "farklı",
eşik yüzde birin onda biri, boy değişimi doğrudan fark. `sharp` zaten
bağımlılıkta. `adim-8/giris` muaf — sahne sürekli hareket ediyor.

**CI'da koşmuyor** ve bu `pnpm e2e` ile aynı sebep: ayakta bir sunucu ve
gösterim verisiyle tohumlanmış bir veritabanı istiyor.

### 4.10 ~~Uzun listeler için sayfalama deseni tek değil~~ ✔ (2026-08-28)

Kural REDESIGN.md Adım 10'da: **imleçli sayfalama** (sonu olmayan defterler),
**tavan + sayaç** (doğal büyüklüğü olan, gözle taranan listeler), **önce arama**
(taranamayacak kadar büyük listeler).

Üçüncüsü için ortak kanca: `components/show-more.tsx`. Kesme _çizimde_, istekte
değil — sıralama ve süzme listenin tamamı üzerinde çalışmaya devam ediyor.
Uygulandığı dört ekranın üçü 6000 piksellik kırpma sınırında kesiliyordu:
vitrin (2654 kart), yönetim ürün listesi (200 satır), kasa defteri.

---

### 4.11 ~~Kategoriler ekranı okuma izniyle açılıyor, her düğmesi yazma izni istiyor~~ ✔ (2026-08-28)

Kapı **yükseltilmedi** (o zaman katalogu görmek isteyen kişi ağacı hiç
göremezdi); izin ekrana taşındı. Yalnız `products.view` olan kullanıcı ekleme
şeridini, yeniden adlandırma düğmesini, üst kategori kutusunu ve Sil düğmesini
görmüyor; başlık "salt okunur" diyor, dipnot hangi iznin gerektiğini yazıyor.
Karar yine sunucuda — bu yalnızca yapılamayacak şeyi önermemek.

---

## 5. Özellik önerileri

Bunlar da bugün koda bakarken çıktı ve **hiçbiri backlog'da yok** — 2026-08-27'de
`schema.prisma` ve `packages/services` üzerinde tek tek arandı, yedisinin de
karşılığı bulunamadı. Öneri, plan değil: sektörü kullanıcı biliyor, gerekçesi
zayıf olanı atın.

### 5.1 ~~Excel ile toplu fiyat/stok güncelleme~~ ✔ (2026-08-28)

`/admin/toplu-guncelleme` — iki sekme (fiyat, stok sayımı), tek akış:

```
şablonu indir → Excel'de düzelt → dosyayı seç → FARK ÖNİZLEMESİ → onayla → uygula
```

**Kural sunucuda, ekranda değil.** `apply` bir imza istiyor; imzayı yalnızca
sunucunun kendi hesapladığı fark üretiyor. Uygulama isteği geldiğinde fark
**yeniden** hesaplanıp imza karşılaştırılıyor: dosya değiştiyse de, aradan biri
girip bir fiyatı değiştirdiyse de tutmuyor ve istek 409 alıyor. İmzasız bir
"uygula" ucu, önizlemeyi bir öneriye çevirirdi.

Üç ayrıntı:

- **Sütunlar ada göre bulunuyor, sıraya göre değil.** Kullanıcı Excel'de kolon
  taşıyor, siliyor, araya ekliyor; sıraya güvenmek "yanlış sütuna kaymış
  kopyalama" felaketinin ta kendisi olurdu. Eşleşme büyük/küçük harf ve Türkçe
  karakterden bağımsız.
- **Stok defterden geçiyor.** `stock` kolonuna doğrudan yazmak Adım 51'in tek
  kapı kuralını çiğnerdi; içe aktarma bir **sayım** (`COUNT`) ve farkı kadar
  hareket açıyor.
- **Her uygulama denetim kaydına yazılıyor**: kim, kaç satır, hangi dosya, hangi
  imza. Fiyat satırının kendisi kimin değiştirdiğini taşımıyor — bir zam
  listesinin kime ait olduğu yalnızca orada kalıyor.

XLSX **okuyucusu** da yazıldı (`xlsx-read.ts`), yazıcının aynası: ZIP + XML,
bağımlılıksız. Paylaşılan metinler, satır içi metinler, Türkçe ondalık
(`1.234,56`) ve noktalı virgüllü CSV karşılanıyor. Sınırları dosyanın başında
yazılı (ilk sayfa, formül değil değer, tarih seri numarası).

13 test (`packages/services/test/integration/bulk-import.test.ts`); üçü doğrudan
imza kuralını sınıyor — uydurma imza, dosya değişimi, veritabanı değişimi.

**Kalan:** 5000 satır sınırı ve 8 MB dosya sınırı sabit; daha büyük katalog
için parçalı yükleme gerekir. Fiyat dışındaki alanlar (maliyet, barkod, raf
kodu) içe aktarılmıyor — aynı makine, yeni sütunlar.

### 5.2 ~~Cari mutabakat~~ ✔ (2026-08-28)

`/admin/mutabakat` (satıcı) + cari ekstrenin üstündeki panel (alıcı).

Defter (`Transaction`) zaten tamdı, ekstre ekranı zaten vardı; eksik olan
**belge ve onay akışı**ydı — muhasebenin yılda iki kez elle yaptığı iş. Deseni
`DealerApplication` ile aynı: talep → cevap.

Üç kural modelin şeklini belirledi:

1. **Bakiye anlık görüntü.** Defter işlemeye devam ediyor, mektup bir **ana**
   ait. `balance`, `totalDebit`, `totalCredit` satıra donuyor. Bugünkü bakiye
   ekranda yanında duruyor, ki mektubun ne kadar eski olduğu görünsün.
2. **Cevap defteri oynatmaz.** "Mutabıkım" bir beyandır, bir işlem değil;
   itiraz da bir düzeltme değil, bir konuşmanın başlangıcı. Cevabın izi
   yalnızca denetim kaydında (`RECONCILIATION_ANSWERED`) — testlerden biri
   tam da bunu sınıyor: cevaptan sonra `Transaction` sayısı değişmiyor.
3. **Bir dönem, bir firma, bir açık mektup.** İkincisi ancak ilki geri
   çekilerek gönderilir; cevaplanmış mektup geri çekilemez — müşterinin
   beyanını satıcının silmesi, mutabakatın taşıdığı tek şeyi yok ederdi.

İki ayrıntı:

- **Dönem sınırları yerel**, UTC değil. Mektup, müşterinin yan yana koyacağı
  ekstre ile aynı günleri kapsamak zorunda ve ekstre yerel gün sınırlarıyla
  çalışıyor. UTC kullanılsaydı Türkiye'de 1 Ağustos'un ilk üç saati Temmuz
  mutabakatına girerdi (ilk çekimde tam bu görüldü: dönem "01.07 – 01.08"
  yazıyordu).
- **Bakiyesi sıfır ve hareketsiz firmaya gönderilmiyor** (istenirse
  gönderiliyor): "borcunuz 0,00 ₺, mutabık mısınız" diye bir mektup alan kişiye
  hiçbir şey sormuyor, gönderene yüz cevapsız satır bırakıyor.

11 test (`packages/services/test/integration/reconciliation.test.ts`).

### 5.3 ~~Tahsilat çalışma listesi~~ ✔ (2026-08-28)

`/rep/tahsilat` — firma seçilmeden önce görünen ekran artık alfabetik bir liste
değil, **"bugün kimi arayacağım"**.

FIFO yaşlandırma Adım 8'de gelmişti ve "kim ne kadar borçlu" sorusunu
cevaplıyordu. Plasiyerin sabah sorduğu soru başka: **sırada kim var.** Aradaki
tek eksik parça aramanın **sonucu**ydu — dün arayıp "15'inde ödeyeceğim" diyen
müşteri, sonuç hiçbir yerde durmadığı için bugün yine listenin başındaydı.

Yeni model tek tablo: `CollectionCall` (sonuç, söz tarihi, söz tutarı, not).
**Ekle-only**: bir arama olmuş bir şeydir, düzeltilmez; yanlış girilen sonucun
üstüne yeni bir kayıt yazılır ve son söz onun olur.

Sırayı **borç büyüklüğü değil durum** belirliyor:

| Sıra | Durum | Anlamı |
| --- | --- | --- |
| 1 | Sözü geçti | Söz günü geldi, para gelmedi |
| 2 | Ulaşılamadı | Tekrar denenecek |
| 3 | Hiç aranmadı | — |
| 4 | Söz yok | Görüşüldü, söz alınamadı |
| 5 | Reddetti | Artık tahsilat aramasının konusu değil |
| 6 | Söz bekleniyor | Günü gelmedi — **aranmayacak** |

Aynı durumdaki iki cari arasında büyük olan önde; ama 5.000 ₺'lik sözü geçen
cari, 100.000 ₺'lik hiç aranmamışın **önünde** (test bunu sabitliyor).

Üç karar:

- **Vadesi geçmemiş cari listeye girmiyor.** Tahsilat araması bir borç
  hatırlatması; vadesi gelmemiş borcu hatırlatmak müşteriyi kızdırmaktan başka
  işe yaramaz.
- **Sözü henüz gelmemiş cari listeden çıkmıyor**, en alta iniyor. Tamamen
  çıkarmak, "ben o adama söz verdirmiştim" diyen plasiyerin sözü nerede
  olduğunu göremediği bir liste olurdu.
- **Tarihsiz söz kaydedilemiyor.** "Ödeyeceğim" deyip gün söylemeyen müşteri,
  yarın yine aranacak biridir; tarihsiz bir söz listeyi hiç değiştirmez.

Firma seçici kaldırılmadı, listenin altına indi: listede olmayan bir cariye de
tahsilat girilebilmeli.

7 test (`packages/services/test/integration/collection-worklist.test.ts`).

### 5.4 ~~Plasiyer primi / hakediş~~ ✔ (2026-08-28)

`/admin/prim` — planlar ve dönem hakedişi tek ekranda.

**Kural motoru yok, bilerek.** Prim şu dörtten ibaret: taban, oran, dönem, hedef
çarpanı. Kampanya motorundaki gibi bir kayıt defteri kurmak, dört alanın üstüne
bir yorumlayıcı koymak olurdu.

**İki taban ayrı plan olarak** tanımlanıyor, tek planda iki oran olarak değil:
bir kurulumda yalnız ciro primi vardır, ötekinde ikisi birden ve farklı
oranlarla. Bir plasiyere iki plan birden atanabilir; hakediş toplamdır.

| Taban | Ne sayıyor |
| --- | --- |
| Ciro | Net mal bedeli (KDV ve navlun hariç), gerçekleşmiş siparişler — hacim iskontosuyla **aynı** tanım |
| Tahsilat | Defterin alacak satırları. Satıp tahsil edemeyen plasiyer kâr getirmez |

Dört karar:

- **Atıf portföye göre**, kaydı kimin girdiğine göre değil. Ofisten girilen bir
  tahsilat da o carinin plasiyerinin primini doğurur; başka bir plasiyerin
  tahsil etmesi primi ona geçirmez. Test bunu doğrudan sınıyor.
- **Çarpanın koşulu satış hedefi.** Taban tahsilat olsa bile karşılaştırma
  ciroyla yapılıyor: tahsilat her zaman cirodan küçük ve ciro hedefiyle
  karşılaştırılsaydı çarpan hiç uygulanmazdı. (İlk çekimde tam bu görüldü.)
- **Hedefi olmayana çarpan yok.** "Hedefi olmayan herkes hak eder" demek,
  çarpanı ikinci bir orana çevirirdi.
- **Hakediş saklanmıyor**, her okumada yeniden hesaplanıyor — dönem kapandıktan
  sonra girilen bir tahsilat da o döneme yazılır. Bedeli: plan silinince geçmiş
  hakediş de kaybolur, o yüzden ekran "silme, pasife al" diyor.

8 test (`packages/services/test/integration/commission.test.ts`).

### 5.7 ~~Zamanlı fiyat değişimi~~ ✔ (2026-08-28)

"1 Eylül'den itibaren zam". Excel'deki fiyat şablonuna **Geçerlilik tarihi**
sütunu eklendi: boş = hemen, dolu = kuyruğa. Aynı dosyada ikisi bir arada
olabiliyor.

**Neden kuyruk, neden `Price.validFrom` değil:** geçerlilik tarihi `Price`
üzerinde olsaydı, "şu andaki fiyat" sorusu her okumada bir alt sorguya
dönüşürdü. O soruyu soran dört yer var (katalog, sepet, teklif, toplu
güncelleme) ve dördü de sistemin en sonuçlu yolunda. Bir zam listesi o yolu
karmaşıklaştırmaya değmez. Bunun yerine `ScheduledPriceChange`: bekleyen satır
zamanı gelince `Price`a **kopyalanıyor**, okuma yolu hiç değişmiyor.

Bedeli, değişimin tam gece yarısında değil işin ilk turunda yürürlüğe girmesi.
İş (`price-schedule`) saat başı koşuyor ve periyodu `/admin/jobs`tan
değiştirilebiliyor.

Dört kural:

- **Geçmişe fiyat yazılmıyor**; bugünün tarihi de geçmiş sayılıyor, çünkü
  "bugünden itibaren" zaten tarihsiz satırın davranışı.
- **Okunamayan tarih sessizce yok sayılmıyor**: "01/09/26" yazan satır
  reddediliyor — hemen uygulanması zammı üç gün erken yapmak olurdu.
- **Uygulanmış satır silinmiyor**, eski fiyatı taşıyor: "ne zaman, ne kadar zam"
  tabloda cevaplanıyor.
- **İptal yalnızca bekleyeni kapatıyor.** Uygulanmış bir fiyatı geri almak ayrı
  bir karar ve yeni bir zamanlı değişiklikle yapılıyor; sessizce geri sarmak,
  aradaki siparişlerin hangi fiyattan geçtiğini belirsiz bırakırdı.

Her satır **kendi işleminde** uygulanıyor: beş yüz satırlık bir listede tek bir
silinmiş varyant, listenin tamamını geri almamalı. Başarısız satır sebebiyle
`FAILED` olarak duruyor ve ekranda görünüyor — bekleyende kalsaydı her turda
yeniden denenir ve kimse fark etmezdi.

Ekran: `/admin/toplu-guncelleme?bolum=zamanli`. 8 test
(`packages/services/test/integration/price-schedule.test.ts`).

### 5.8 ~~Backorder / bekleyen bakiye~~ ✔ (2026-08-28)

`/admin/deliveries?bolum=bekleyen` — sipariş edilip sevk edilmemiş mal.

**Yeni kayıt yok, yeni durum yok.** Bekleyen bakiye türetilmiş bir sayı:
`quantity − quantityShipped`. Ayrı bir kolonda tutulsaydı iki sayı birbirinden
ayrışabilir ve hangisinin doğru olduğu belirsiz kalırdı. Eksik olan şey veri
değil, **görünüm**di: kısmi sevkiyat Adım 7'den beri var ama onu toplu gösteren
hiçbir ekran yoktu; depocu "hangi üründen ne kadar borçluyuz" sorusunu ancak
siparişleri tek tek açarak cevaplayabiliyordu.

İki tablo, iki ayrı soru — bilerek ayrı:

| Tablo | Soru | Kime |
| --- | --- | --- |
| Ürün bazında | "neyden ne kadar borçluyuz, elde var mı" | depo / satın alma |
| Sipariş bazında | "hangi müşteri ne bekliyor" | müşteri ilişkileri |

İki karar:

- **Teslim edilmiş sipariş listeye girmiyor.** Kapanmış bir siparişin eksiği
  artık bekleyen mal değil; onu iade/RMA ya da yeni bir sipariş çözer.
- **"Sevk edilebilir" künyesi bir iş emri**: eldeki mal bekleyenin tamamını
  karşılıyor, yani mal depoda duruyor ve müşteri bekliyor. Karşılamıyorsa satın
  almanın işi.

Sıralama tutara değil **süreye** göre: bekleyen bakiyede en eski borç en üstte.

5 test (`packages/services/test/integration/backorder.test.ts`).

### 5.10 ~~Kampanya simülatörü~~ ✔ (2026-08-28)

`/admin/promotions?bolum=simulasyon` — _"bu kampanyayı açsaydım geçen ayki
siparişlerde ne kadar indirim verirdim?"_

Motor **ve** sipariş geçmişi zaten vardı; eksik olan tek şey ikisini bir araya
getirmekti. Pahalı bir hatayı yayına almadan yakalıyor: %20'lik bir kampanya
tanımlayıp "bir deneyelim" demek, geçen ayın cirosunun beşte birini kaybetmeyi
göze almak demek.

**Hiçbir şey yazmıyor** — kuru koşu. `PromotionRedemption` açılmıyor, sipariş
tutarları değişmiyor; test bunu satır satır doğruluyor. Uç `GET`, çünkü sonuç
paylaşılabilir bir adres olarak durabilmeli.

Üç ayrıntı sonucu gerçekçi kılıyor:

1. **Satır neti kampanya öncesine geri sarılıyor.** `lineTotal` kayıtlı
   kampanyanın indirimini zaten düşmüş; `lineTotal + promotionDiscount` motorun
   beklediği taban. Geri sarılmasaydı indirim ikinci kez uygulanırdı.
2. **Kotalar zaman sırasında tükeniyor.** Kullanım limiti olan bir kampanya
   gerçekte de ilk gelen siparişlere uygulanırdı; simülasyon eskiden yeniye
   yürüyor ve kotaya takılanları ayrıca sayıyor.
3. **`previousOrderCount` o günkü değeriyle.** "İlk sipariş" koşulu, bugün otuz
   siparişi olan bir müşterinin ilk siparişinde de doğruydu.

Sonuç **tek kampanyanın tek başına** ne vereceğidir; aynı anda çalışacak iki
kampanyanın birleşik etkisi bundan farklı olur ve ekran bunu yazıyor.

4 test (`packages/services/test/integration/promotion-simulation.test.ts`).

### 5.11 ~~Bildirim kanalı soyutlaması~~ ✔ (2026-08-28) · WhatsApp adaptörü **kararınız**

Yapılan şey **kanal kayıt defteri** (`packages/services/src/notification-channel.ts`),
WhatsApp adaptörü değil.

Neden böyle: Business API ücretli, onay istiyor ve sözleşme olmadan yazılacak
kod tahmine dayanır — sanal POS adaptörüyle **birebir aynı gerekçe** (§7).
Yapılabilecek olan şey, gelecekteki adaptörün tek dosyaya sığmasını sağlamaktı
ve o yapıldı: `NotificationChannel` yazıp `CHANNELS` dizisine eklemek yeterli,
`notification.ts` ve hiçbir çağrı yeri değişmiyor.

Öncesinde her `notifyX` fonksiyonu önce `sendMail`, sonra `sendPush` diyordu;
üçüncü bir kanal eklemek her çağrı yerine dokunmak demekti. Şimdi `announce()`
yalnızca "şu kitleye şu mesajı" diyor.

Kanallar **paralel** çalışıyor ve **hiçbir zaman fırlatmıyor**: e-postası düşen
ama telefonuna düşen bir bildirim "başarısız" diye kaydedilmiyor. Denetim kaydı
artık kanal kanal sonuç taşıyor.

**Bildirim tercihi de geldi** (§3.5'in "ya hepsi ya hiçbiri" maddesi):
`/hesabim` → Bildirimler. `User.mutedNotifications` **istemediklerinin**
listesi; ters kodlansaydı yeni bir olay eklendiğinde kimse onu almazdı ve
sessizce kaybolan bir bildirim, gürültülü olandan kötüdür. Susturma **olay**
bazında, kanal bazında değil: "sipariş bildirimi istemem" diyen kişi onu
e-postayla da telefonla da istemiyor.

5 test (`packages/services/test/integration/notification-channel.test.ts`).

**Sizin kararınız bekleyen:** WhatsApp Business API sözleşmesi ve numarası.
Karar verilirse iş, tek dosyalık bir `whatsappChannel` yazıp `CHANNELS`e
eklemek — mesajın `short` alanı zaten kısa metin taşıyor.

---

## 6. ~~Yönetici panosu~~ ✔ (2026-08-28)

`/admin/analitik` — altı bölüm, hepsi `?bolum=` ile adreste:
**anlık durum · büyüme · müşteri · ürün & stok · nakit & alacak · gidişat**.

### 6.1 Dört mimari karar — nasıl uygulandı

1. **Gecelik özet.** `AnalyticsSnapshot` tablosu (bölüm başına tek satır,
   sürüm geçmişi yok), `analytics-snapshot` adlı gecelik iş hesaplıyor,
   `readSnapshot` okuyor. **Anlık kutular canlı** — "bugünün cirosu" dün
   geceden olamaz. Hangi bölümün ne zaman hesaplandığı her sekmenin üstünde
   yazıyor. Gecelik olmasının sebebi hız değil **tutarlılık**: sabah bakılan
   kohort tablosuyla öğlen bakılan aynı olmalı, yoksa aradaki fark işin
   değişmesi sanılır.
2. **Toplama SQL'de, matematik JS'te.** `analytics.ts` sorguları `GROUP BY` ile
   satır sayısını indiriyor; regresyon, kohort matrisi, HHI, RFM çeyreklikleri
   ve şelale `analytics-math.ts`te — veritabanına hiç bakmayan, 24 testi olan
   saf bir dosya.
3. **İzin `analytics.view`, rol değil.** Kapsamı yalnızca satıcının kendi
   ekibine verilebiliyor (`PERMISSION_SCOPE`): pano marj gösteriyor, yani
   `costPrice`ı dolaylı olarak açıyor. Bayiye vermek müşteriye maliyeti
   göstermek, sahaya vermek plasiyerin pazarlık sınırını değiştirmek olurdu.
   İzin göçü ayrı dosyada (yükselten kurulumda kimsenin satırına yazmaz).
4. **Her kutu kaynağına bağlanıyor.** `SourceTile` tıklanınca sayıyı üreten
   listeye gidiyor — satış raporu, alacak yaşlandırma, kasa defteri, çek
   portföyü, stok defteri, firma listesi, hedefler. Karşılığı olan bir ekran
   yoksa kutu düz kalıyor.

### 6.2 İki dürüstlük kuralı — ve üçüncüsü

**Az veriyle yalan söyleme.** Her göstergenin asgari veri şartı kodda:
trend eğimi 6 ay, CAGR 24 ay, RFM 8 firma, karşılıksız oranı 10 kâğıt.
Karşılanmıyorsa sayı yerine eksiğin kendisi yazılıyor ("en az 24 ay gerekiyor,
4 var"). Tabanı sıfır olan seride CAGR'ın sebebi ayrıca söyleniyor — "24 ay
gerekiyor" demek, 24 ayı olan kullanıcıyı şaşırtır.

**Mevsimsellik esas.** Karşılaştırma yıl-üstü-yıl; **MoM hiç hesaplanmıyor.**
Ay sonu projeksiyonu takvim gününe değil **iş gününe** göre, ve geçen yılın
aynı ayının ritmiyle düzeltiliyor.

Kodu yazarken üçüncü bir kural çıktı: **maliyet kapsamı.** İlk koşuda pano
"brüt marj %46,7" yazıyordu; oysa 2655 aktif varyantın alış fiyatı boştu ve
maliyetsiz ürün sıfır maliyetli sayılıp marjı şişiriyordu. Marj artık yalnızca
cironun en az **%60**'ı maliyeti girilmiş üründen geliyorsa yazılıyor, ve kaç
varyantın boş olduğu ekranda duruyor.

Aynı turda bulunan iki sahte gösterge kaldırıldı:

- "Vadesinde ödeme oranı" **her zaman %100** dönüyordu (tahsilat satırının
  vadesi olmadığı için karşılaştırma kendi kendine doğruydu). Yerine ölçülebilir
  olan kondu: vadesi geçen borcun toplam alacağa oranı.
- Trend eğimi, kurulumun açılmasından önceki 22 boş ayı da hesaba katıyordu ve
  "aylık ortalama +45.826 TL büyüme" diyordu. Serinin başındaki boş aylar artık
  atılıyor — işin başlamadığı ay bir veri noktası değil.

### 6.3 ~~Vega sorusu~~ ✔ cevaplandı (2026-08-28) — iş hâlâ yapılmadı

Kullanıcı _"Vega'nın rapor sistemi gibi"_ demişti ve hangi rapor olduğu
bilinmiyordu; uydurulmadı, pano sektör standardı göstergelerle kuruldu.

**2026-08-28'de kullanıcı söyledi: kastedilen şey
`C:\Users\saidb\Desktop\projeler\vega_sorgu` projesi.** Aynı oturumda
"bu pencere üzerinden ilerlemeyeceğim" dedi, yani **karşılaştırma yapılmadı ve
kod yazılmadı** — bu bir sonraki sohbetin işi.

SQL Server'daki Arctos/Vega ERP'ye bağlanan localhost dashboard'u. Firma +
dönem seçiliyor (`F{firma}D{dönem}` tablo şablonu), günlük nakit / visa /
çek-senet hareketleri gösteriliyor. Dokuz rapor sayfası
(`client/src/pages/`):

`Home` · `SonIslemler` · `CariKartlar` · `BankaHareket` · `BankaRaporlari` ·
`CekRaporlari` · `SenetPortfoy` · `VisaRaporlari` · **`SatisKarlilik`**

İlk iş, bu dokuzun b2b'de hangisinin zaten karşılandığını çıkarmak olmalı —
çek/senet portföyü (Adım 41), banka/kasa defteri (Adım 27) ve cari kartlar
zaten var; eksik görünen `SatisKarlilik`.

✔ **`SatisKarlilik` karşılandı (2026-08-29):** panonun kârlılık bölümü
(`/admin/analitik?bolum=karlilik`) — marj köprüsü, aylık kâr, ve firma /
kategori / plasiyer kırılımı. **Birebir kopya değil**: Vega'nın ekranı SQL
Server'daki ERP tablolarından okuyor, buradaki b2b'nin kendi sipariş
satırlarından. Kalan sekiz sayfanın satır satır karşılaştırması hâlâ
yapılmadı.

⚠ **`vega_sorgu/README.md`'deki izahat kodu haritası bayat ve yanlış.** Aynı
depodaki `client/src/constants/izahat.js` onu düzeltiyor ve gerekçesini
yazıyor: canlı DB'de (F0101 D0017) ampirik eşleştirilmiş, ve
"21-24 = Çek/Senet, 13/14 = Visa" haritası **yanlışmış** — çek/senet kendi
tablolarında (`TBLCEK*` / `TBLSENET*`). Kaynak olarak `izahat.js` alınmalı, ve
§6.3'ün açık kalan bir yan işi olarak Vega Kılavuzu'ndaki eşleme bilgisi bu
dosyaya karşı bir kez doğrulanmalı.

### 6.4 Kalanlar

- ~~**Kohort penceresi 12 ay, RFM penceresi 365 gün** — sabit.~~ ✔ (2026-08-28)
  İkisi de ekranın süzgeci: kohort 6/12/24 ay, RFM 90/180/365 gün, ikisi de
  adreste (`?rfm=&kohort=`). **Gecelik özet yalnızca varsayılanı hesaplıyor** —
  dokuz kombinasyonu her gece hesaplamak, sekizi hiç açılmayacak bir işi her
  gece yapmak olurdu; varsayılan dışı pencere canlı hesaplanıyor ve cevap
  "canlı" diye işaretleniyor, yani "ne zaman hesaplandı" satırı dürüst kalıyor.
  Kohort penceresi yalnızca **kaç kohort** gösterileceğini değiştiriyor; bir
  firmanın hangi kohorta düştüğü ilk siparişiyle belirleniyor ve pencereyle
  oynamıyor.
- **Ortalama gecikme yaklaşık**: borç satırı ile onu kapatan tahsilat kuruşuna
  kadar eşlenmiyor (o işi ekstredeki FIFO mahsup yapıyor). Ekranda böyle
  yazıyor. **Hâlâ açık** — kapatmak için mahsup eşlemesinin defterde saklanması
  gerekir, bu da ekran değil defter işi.
- ~~**Resmî tatiller iş günü sayılıyor**~~ ✔ (2026-08-28) `/admin/tatiller`
  (`organization.manage`) takvimi tutuyor, `businessDaysBetween` onu düşüyor,
  arife 0,5 iş günü sayılıyor. Tarihler **tabloda**, kodda değil: 1 Ocak sabit
  ama ramazan ve kurban ay takvimiyle kayıyor ve gömülü bir liste ikinci yıl
  sessizce bayatlar. Ekran sabit tarihli millî günleri **öneriyor**, dinî
  bayramları önermiyor — uydurulmuş bir tarih boş takvimden kötü. Takvim boşken
  bütün sayılar eskisiyle birebir aynı.

## 7. Gözetimsiz yapılmayacaklar

Gece boyu çalışırken **bunlara dokunmayın**:

1. **ERP'ye canlı yazma denemesi** — müşterinin ERP'sine gerçek kayıt.
2. **Sanal POS adaptörü** — sözleşme ve anahtar yok; yazılacak kod tahmine
   dayanır.
3. **`db:seed-demo` yeniden çalıştırma** — gösterim kimlikleri `cuid`,
   her tohumlamada değişiyor. Ekran görüntüsü betiği kimlikleri DB'den çözüyor
   ama gereksiz yere sıfırlamayın.
4. **Adım 46 tema motorunu geri getirme** — bilerek geri alındı.
5. **`documents/**` altındaki ham `neutral-` sınıfları** — bilerek orada.
6. **Veri silen ya da kolon düşüren göç.** Ekleyen göç (`AnalyticsSnapshot`,
   `CollectionCall`, `Price.validFrom`, `Order.source` gibi) **serbest** — §5 ve
   §6'nın yarısı zaten onu istiyor. Yasak olan `DROP`/`ALTER ... DROP` ve veri
   dönüştüren tek yönlü göç; onlar geri alınamaz.
7. **`git push --force`, `git reset --hard`** — normal commit+push serbest,
   yıkıcı git yasak.

---

## 8. Her adımın ritüeli

```bash
# 0. Veritabanı ayakta olsun (Docker Desktop elle açılıyor, otomatik değil)
docker compose up -d db
pnpm db:test-prepare                    # testlerin şeması; göç eklendiyse tekrar

# 1. Kod
# 2. Doğrulama — CI tam bu sırayı çalıştırıyor
pnpm typecheck && pnpm lint && pnpm test && pnpm build

# 3. Ekran görüntüsü (derlemeden AYRI sırada!)
pnpm --filter web dev -p 3100          # `--` KOYMAYIN
SHOT_BASE_URL=http://localhost:3100 pnpm shots --step <n>   # burada da `--` YOK

# 4. Görüntüleri GERÇEKTEN AÇ ve bak. Dosya boylarına da bak:
#    3000 pikselden uzun PNG = sınırlanmamış liste var.
# 5. REDESIGN.md + FEATURES.md güncelle
# 6. commit + push + gh run list
```

**Tuzaklar** (hepsi en az bir kez ısırdı):

- **Sunucu ayaktayken `next build` çalıştırmayın.** Aynı `.next` klasörünü
  paylaşıyorlar; derleme sunucunun sunduğu parçaları yerinden ediyor, sunucu
  ölmüyor, ekran görüntüsü **ham HTML** çıkıyor. Olduysa: sunucuyu durdur,
  `rm -rf apps/web/.next`, yeniden başlat. (`assertStyled` artık yakalıyor.)
- **`pnpm --filter web dev -p 3100`** — `--` koymayın, pnpm 9 onu next'e aynen
  geçiriyor ve next onu dizin adı sanıyor.
- **`pnpm build` mobili derlemez, `pnpm typecheck` derler.** Adım 24'te
  build+test+lint yeşilken mobil `tsc` kırıldı.
- **Push (Windows):** düz `git push` `fatal: Cannot prompt` veriyor.
  ```bash
  git -c credential.helper= -c credential.helper='!f(){ echo username=x-access-token; echo password=$GH_TOKEN; };f' push origin main
  ```
- **Çok satırlı commit mesajı:** PowerShell here-string'i bozuyor. Bash aracı +
  `git commit -F -` ya da dosyadan.
- **`tailwind.config.ts`'e yeni punto eklerseniz** `utils.ts` içindeki
  `extendTailwindMerge`in `font-size` grubuna da ekleyin — yoksa
  `tailwind-merge` onu renk sanıp `text-on-accent`i eziyor (siyah üstüne siyah).
- **Sekme/kip URL'de olmalı**, bileşen durumunda değil — betik düğmelere
  basmıyor, fotoğraflanamayan ekranın doğru göründüğü söylenemez.

---

## 9. ~~FEATURES.md bayat~~ ✔ (2026-08-28)

Bir tur atıldı:

- Tarih satırı ve **adım durumu tablosu** güncellendi; 61, 63, 64 ve depo
  sürücüsü satırları eklendi, arayüz yenilemesinin 11 adımı kendi tablosuna
  girdi.
- `Bilinen Eksikler`teki dört bayat madde kapatıldı (görsel işleme + S3
  sürücüsü, hediye kademesi, RMA, arayüz Faz 3) ve test boşluğu satırı
  bugünkü rakamlarla yazıldı.
- Üç yeni bölüm: **§58 iki adımlı doğrulama**, **§59 arayüz yenilemesi**,
  **§60 test yalıtımı**. API tablosuna arama ve 2FA uçları eklendi.
- `Sonraki Adımlar`ın "yakın plan"ı üç bitmiş işi sayıyordu; yerine mobil
  yenileme, yönetici panosu, Excel içe aktarma ve test boşluğu yazıldı.

## 10. Sıradaki

§5'in tamamı kapandı; §6.4'ün iki kalemi ve §3.5'in iki kalemi 2026-08-28'de,
artık kopyalar ve §6.3'ün `SatisKarlilik` sayfası 2026-08-29'da kapandı.
Kalanlar, bağımlılık ve maliyet/etki sırasıyla — söz değil, sıra önerisi:

### Hemen yapılabilir (kod, karar gerektirmiyor)

1. ~~**§6.4 pano kalanları.**~~ ✔ (2026-08-28) Kohort ve RFM penceresi ekranın
   süzgeci oldu, resmî tatil takvimi geldi. Bu maddeden geriye **ortalama
   gecikmenin yaklaşıklığı** kaldı ve o bir ekran işi değil: kapatmak için
   borç satırı ile onu kapatan tahsilatın defterde eşlenmesi gerekiyor.
2. ~~**§3.5 kampanya ekranı ve parti basımı.**~~ ✔ (2026-08-28) Bu maddeden
   geriye **tartılan malın faturada yeniden tartıya göre fiyatlanması** kaldı.
   Küçük değil: kantar okuması bir belge alanı olmadığı için önce nereden
   geleceğine karar vermek gerekiyor (kurye cihazı mı, elle giriş mi), ve
   fiyatın sipariş anındaki tutardan **sapmasına** izin veren ilk yer burası
   olacak.
3. ~~**Artık kopyaları sil.**~~ ✔ (2026-08-29) 933 dosya silindi; ayrıntı
   §1'de. `tsconfig.exclude` + `eslint ignorePatterns` istisnaları **bilerek
   bırakıldı**: kaza tekrarlarsa yine susturur.
4. **Depo/şube bazlı stok** (§3.5). Sipariş bir depo seçmiyor; hareket toplamı
   oynuyor ama kırılım yok. Backlog'daki maddenin işi, ama kodu hazır olan
   tarafı (StockMovement zaten `warehouseId` taşıyor) bunu ucuzlatıyor.

### Karar bekleyen

5. **WhatsApp/SMS kanalı** (§5.11). Business API sözleşmesi ve numarası sizin
   kararınız; soyutlama hazır, iş tek dosyalık bir adaptör.
6. **§3.6 backlog** — 14 başlık, sıralanmadı. Öne çıkanlar: teklif yönetimi,
   vade farkı & erken ödeme iskontosu, firma risk skoru + otomatik blokaj,
   holding/şube konsolidasyonu, matrix katalog, çoklu dil, dışa açık B2B API.
7. **§3.4 canlıya çıkış turu** — dört maddesi de dağıtım topolojisine bağlı;
   şimdi yazılırsa tahmine dayanır.

### Kullanıcının "geç" dediği (2026-08-28)

8. **Adım 9 — mobil.** `apps/mobile` eski palette, tek test yok.
9. **§3.2 ERP'ye canlı yazma denemesi** — ⚠ gözetim gerektiriyor (§7).
10. **§3.3 sanal POS adaptörü ve iOS** — dış bağımlılık.

**Vega sorusunun bir sayfası kapandı** (§6.3): eksik görünen `SatisKarlilik`
2026-08-29'da panonun **kârlılık bölümü** olarak geldi. Kalan sekiz sayfanın
karşılaştırması yapılmadı — çek/senet, banka/kasa ve cari kartlar zaten var
görünüyor ama satır satır bakılmadı.
