# Kalan işler — devir belgesi

**Yazıldığı gün: 2026-08-27, son güncelleme 2026-08-28.**
§10'daki dokuz maddenin dokuzu da kapandı; her biri ayrı commit.

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
| Test             | 344 (apps/web) + 590 (servisler) + 18 (ERP ajanı); `pnpm test` yeşil        |
| e2e              | 23 senaryo, `pnpm e2e` — CI'da değil, ayakta sunucu + gösterim verisi ister |
| CI               | `pnpm typecheck` → `lint` → `test` → `build`, dördü de yeşil                |
| Ham sınıf sayacı | `dark:` **0** · `neutral-` **0** · `brand-` **0** (`documents/**` hariç)    |
| Yenileme         | Adım 1-8, 10-13 bitti; açık kalan tek adım **9 — mobil**                    |

Bugün eklenen ekranlar: yönetici panosu (`/admin/analitik`, altı bölüm) ve
Excel ile toplu güncelleme (`/admin/toplu-guncelleme`). Testler artık ayrı bir
şemada koşuyor, gösterim veritabanına dokunmuyor.

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

- Parti irsaliyede otomatik basılmıyor (defterden okunuyor); tartılan mal
  faturada yeniden tartıya göre fiyatlanmıyor.
- **Sipariş bir depo seçmiyor** — hareket toplamı oynuyor, kırılım yok.
  Backlog'daki "depo/şube bazlı stok + fiyat" maddesinin işi.
- Bildirim tercihi yok — ya hepsi ya hiçbiri. SMS kanalı yok.
- Hazır kampanya performans **ekranı** yok — `PROMOTIONS` veri kümesi var,
  rapor tasarımcısından kuruluyor.
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

### 4.5 `EmptyState`in `action` yuvası kullanılmıyor

68 çağrının **1'i** `action` veriyor. "Henüz kampanya yok" diyor ama yeni
kampanya düğmesi vermiyor; kullanıcı panelin başlığına dönmek zorunda. Boş
ekran, bir sonraki adımı söylemesi gereken tek ekrandır.

### 4.6 Süzgeçler adreste değil

Güvenlik kaydı süzgeci, hareket akışı süzgeci, kullanıcı sekmesi — hiçbiri
URL'de. İki sonuç:

1. "Geçen haftanın başarısız girişleri" diye bir bağlantı paylaşılamıyor.
2. **Fotoğraflanamıyor.** Kendi ekran görüntüsü kuralımız bunu yasaklıyor;
   stok defterinin dört sekmesi tam bu yüzden `?bolum=` ile adreslenmişti.

### 4.7 `orders/[id]` hâlâ kabuksuz

Tasarım dilinin 5. kuralını ("tek kabuk") çiğneyen **tek** ekran, Adım 3'ten
beri açık. Düzeltmek rolü kabukla eşlemeyi gerektiriyor: süper admin →
`AdminShell`, plasiyer → `RepNav`, alıcı → `PortalNav` + firma bağlamı.

### 4.8 `Modal`da odak tuzağı yok

Escape ve arka plan tıklaması var; **odak tuzağı ve açılışta ilk alana odak
yok**. Klavye kullanıcısı pencere açıkken arkadaki sayfada geziniyor. `Modal`
zaten tek yerde — düzeltme bir kez yazılır, her pencereye yansır.

### 4.9 Ekran görüntüsü regresyon kontrolü

`pnpm shots` zaten var. `--check` kipi (yeni çekimi git'tekiyle karşılaştır,
fark varsa sıfırdan farklı çık) tasarım kaymasını CI'da yakalar. Mevcut aracın
üstüne küçük bir ekleme, yeni bağımlılık yok.

⚠ Giriş sahnesi sürekli hareket ediyor (`adim-8/giris`) — o dosya kıyaslamadan
muaf tutulmalı, yoksa her koşuda kırmızı yanar.

### 4.10 ~~Uzun listeler için sayfalama deseni tek değil~~ ✔ (2026-08-28)

Kural REDESIGN.md Adım 10'da: **imleçli sayfalama** (sonu olmayan defterler),
**tavan + sayaç** (doğal büyüklüğü olan, gözle taranan listeler), **önce arama**
(taranamayacak kadar büyük listeler).

Üçüncüsü için ortak kanca: `components/show-more.tsx`. Kesme _çizimde_, istekte
değil — sıralama ve süzme listenin tamamı üzerinde çalışmaya devam ediyor.
Uygulandığı dört ekranın üçü 6000 piksellik kırpma sınırında kesiliyordu:
vitrin (2654 kart), yönetim ürün listesi (200 satır), kasa defteri.

---

### 4.11 Kategoriler ekranı okuma izniyle açılıyor, her düğmesi yazma izni istiyor

Ekran testleri yazılırken çıktı. `/admin/categories` kapısı `products.view`
(katalogu _görmek_), ama ekrandaki her mutasyon uçta `categories.manage`
istiyor. Yalnız `products.view` verilmiş bir kullanıcı ekranı açıyor, kategori
adını değiştiriyor, düğme 403 alıyor ve sebebini görmüyor.

İki çözüm de küçük: ya kapı `categories.manage`e çıkar (ama o zaman katalogu
görmek isteyen kişi kategori ağacını da göremez), ya da ekran izin yokken
düzenleme kontrollerini çizmez. İkincisi doğru olan — okumak yazmayı
gerektirmiyor — ve `permission-picker` deseninde karşılığı var.

Test mevcut davranışı sabitledi, yani değiştirildiğinde kırılacak.

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

### 5.2 Cari mutabakat ★★★

Türk B2B'sinin dönem sonu ritüeli: mutabakat mektubu gider, müşteri onaylar ya
da itiraz eder. Defter (`Transaction`) tam, ekstre ekranı var — **belge ve onay
akışı yok.**

Deseni zaten elimizde: `DealerApplication` tam olarak "talep → cevap" akışı.
Bayi portalına "mutabıkım" / "itirazım var + gerekçe" düğmesi, yönetime
mutabakat listesi. Muhasebenin yılda iki kez elle yaptığı iş.

### 5.3 Tahsilat çalışma listesi ★★

FIFO yaşlandırma Adım 8'de geldi. Ama plasiyerin sabah sorduğu soru **"bugün
kimi arayacağım"** ve o listeyi hiçbir ekran vermiyor.

Vadesi X gün geçmiş + tutara göre sıralı + **arama sonucu kaydedilen** ("söz
verdi 15'i", "çek verecek", "ulaşılamadı"). Veri tamamen mevcut: `Transaction`
yaşlandırma + `CheckIn` + `Company`. Yeni model tek satır: `CollectionCall`.

### 5.4 Plasiyer primi / hakediş ★★

Hedefler Adım 34'te geldi, **prim yok** (`commission|prim` → sıfır eşleşme).
Sektörde plasiyer primle çalışır ve prim **iki tabandan** hesaplanır: ciro
**ve** tahsilat — satıp tahsil edemeyen plasiyer kâr getirmez.

Sipariş, tahsilat ve plasiyer bağı zaten kayıtlı. Kural motoru gerekmiyor:
oran + taban + dönem + (opsiyonel) hedefe bağlı çarpan.

### 5.5–5.9 Ucuz olanlar

| Fikir                             | Durum | Neden                                                                                                    |
| --------------------------------- | ----- | -------------------------------------------------------------------------------------------------------- |
| **Minimum sipariş tutarı/koli**   | yok   | Toptanda standart. Firma başına ya da genel; tek alan + sepette tek kontrol                              |
| **Sipariş kesim saati (cut-off)** | yok   | Gıda toptanında "16:00'dan sonrası yarına". Sevkiyat planını o belirliyor                                |
| **Zamanlı fiyat değişimi**        | yok   | "1 Eylül'den itibaren zam". `Price`'ta `validFrom` yok; `Job` zamanlayıcı hazır                          |
| **Backorder / bekleyen bakiye**   | yok   | Kısmi sevkiyat var (`quantityShipped`), ama "40 koli bekliyor, mal gelince sevk et" takibi yok           |
| **`Order.source`**                | yok   | Sipariş web'den mi, mobilden mi, plasiyerden mi geldi — tek enum alanı, sonrası rapor kırılımında bedava |

### 5.10 Kampanya simülatörü

_"Bu kampanyayı açsaydım geçen ayki siparişlerde ne kadar indirim verirdim?"_

Promosyon motoru **ve** sipariş geçmişi ikisi de var; motoru geçmiş siparişlere
kuru kuruya koşturmak yetiyor. Pahalı bir hatayı yayına almadan yakalar.

### 5.11 WhatsApp bildirim kanalı

Backlog'da "bildirim motoru: FCM + SendGrid/Twilio" yazıyor. Türkiye'de bayiyle
asıl konuşulan kanal WhatsApp; e-posta okunmuyor. Business API ücretli ve onay
istiyor — **karar kullanıcının**, ama kanal soyutlaması yazılırken hesaba
katılmalı ki sonradan üçüncü bir kanal eklemek her çağrı yerine dokunmasın.

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

### 6.3 Vega sorusu — hâlâ açık

Kullanıcı _"Vega'nın rapor sistemi gibi"_ demişti. **Vega'nın rapor ekranları
depoda yok** ve hangi raporun karşılığının istendiği bilinmiyor. Uydurulmadı:
yukarıdaki liste sektör standardı bir yönetici panosu. Vega'ya özgü bir rapor
isteniyorsa kullanıcıdan ekran görüntüsü ya da rapor adı gerekiyor.

### 6.4 Kalanlar

- **Kohort penceresi 12 ay, RFM penceresi 365 gün** — sabit. Kullanıcı seçmeli
  olması istenirse ekranın kendi süzgeci gerekir.
- **Ortalama gecikme yaklaşık**: borç satırı ile onu kapatan tahsilat kuruşuna
  kadar eşlenmiyor (o işi ekstredeki FIFO mahsup yapıyor). Ekranda böyle
  yazıyor.
- **Resmî tatiller iş günü sayılıyor** — bayram aylarında ay sonu tahmini
  yüksek çıkar. Tatil takvimi girilirse düzelir.

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

2026-08-28'de kapanan dokuz madde (her biri ayrı commit, hepsi push edildi):

| #   | İş                                    | Nerede        |
| --- | ------------------------------------- | ------------- |
| 1   | Adım 7 — rapor tasarımcısı ve panolar | REDESIGN.md   |
| 2   | Adım 8 kalanı — `hesabim`, `403`      | REDESIGN.md   |
| 3   | Adım 11 — saha üçlüsü ve kök          | REDESIGN.md   |
| 4   | Test yalıtımı (§4.1)                  | §4.1, README  |
| 5   | Adım 10 temizlik + §4.2/4.3/4.4/4.10  | REDESIGN.md   |
| 6   | FEATURES.md güncellemesi (§9)         | FEATURES.md   |
| 7   | Yönetici panosu (§6)                  | §6, Adım 12   |
| 8   | Excel içe aktarma (§5.1)              | §5.1, Adım 13 |
| 9   | Test boşluğu (§3.1)                   | §3.1, README  |

**Sırada ne var** — bağımlılık ve maliyet/etki sırası, söz değil:

1. **Yenilemenin Adım 9'u — mobil.** Web tarafında elden geçmemiş ekran
   kalmadı; `apps/mobile` aynı palete ve tipografiye taşınacak. Mobilde tek
   test olmaması da aynı turda ele alınmalı.
2. **§4.5–4.9 arayüz artıkları.** `EmptyState`in kullanılmayan `action` yuvası,
   adreste olmayan süzgeçler, kabuksuz `orders/[id]`, `Modal`da odak tuzağı,
   ekran görüntüsü regresyon kontrolü (`pnpm shots --check`). Beşi de küçük.
3. **§4.11** — kategoriler ekranının okuma izniyle açılıp yazma izni istemesi.
4. **§5.2–5.11 özellik önerileri.** En getirilisi cari mutabakat ve tahsilat
   çalışma listesi; ikisi de mevcut defterin üstüne biniyor.
5. **§3.2 ERP'ye canlı yazma denemesi** — ⚠ gözetim gerektiriyor (§7).
6. **§3.4 canlıya çıkış turu** ve **§3.6 backlog** — ikisi de iş kararı
   bekliyor.

**Vega sorusu hâlâ açık** (§6.3): "Vega'nın rapor sistemi gibi" denen şeyin
hangi rapor olduğu bilinmiyor. Uydurulmadı; kullanıcıdan ekran görüntüsü ya da
rapor adı gerekiyor.
