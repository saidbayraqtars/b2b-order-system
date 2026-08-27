# Kalan işler — devir belgesi

**Yazıldığı gün: 2026-08-27, genişletildi 2026-08-28.**
Son commit `349df39`; yenilemede Adım 6 bitti ve push edildi.

Bu dosya `docs/design/REDESIGN.md`in yaptığı şeyi bütün proje için yapıyor:
nerede kalındı, sırada ne var, hangi karar neden verildi, neye dokunulmayacak.
Yeni bir sohbet açtığınızda önce bunu okutun.

- Ekran yenilemesinin kendi ayrıntısı: `docs/design/REDESIGN.md`
- Özellik envanteri: `FEATURES.md` (**kısmen bayat**, aşağıda §9)
- Ekran görüntüsü kuralı: `docs/design/screens/README.md`

---

## 1. Bugünün durumu

| | |
| --- | --- |
| Commit | `bc4fe68`, `origin/main` ile eşit |
| Test | 233 rota (apps/web) + servis paketi; `pnpm test` yeşil |
| CI | `pnpm typecheck` → `lint` → `test` → `build`, dördü de yeşil |
| Ham sınıf sayacı | `dark:` 83 · `neutral-` 186 · `brand-` 13 |
| Yenileme | Adım 1-6 + 8 bitti; 7, 8-kalan, 9, 10 açık |

---

## 2. Ekranlar — 14 kaldı

61 rotanın 47'si elden geçti. Kalanlar:

### Adım 7 — Rapor tasarımcısı ve panolar (7 ekran, 53 ham satır)

| Rota | Not |
| --- | --- |
| `/reports` | rapor listesi |
| `/reports/new` | tasarımcı — ekranların en karmaşığı |
| `/reports/[id]` | rapor görüntüleme |
| `/reports/[id]/print` | yazdırma yüzeyi — `documents/**` gibi mi davranacak, karar ver |
| `/reports/dashboards` | pano listesi |
| `/reports/dashboards/[id]` | pano detayı |
| `/admin/reports` | yönetim tarafı |

Paylaşılan bileşen: `components/report-preview.tsx` (11 ham satır).

**Dikkat:** rapor tasarımcısı Adım 53'te "ortak dile taşındı" diye kapatılmıştı
ama kendi kopya `Panel`i vardı ve 46 ham satır hâlâ duruyor. "Zaten yapıldı"
diye atlamayın.

### Adım 8 kalanı — hesap ekranları (2 ekran, 23 ham satır)

`/hesabim` (18) ve `/403` (5).

### Sırasız — saha üçlüsü + kök (4 ekran, 62 ham satır)

**REDESIGN.md'nin Adım 1-10 listesinde bunlar yok.** Gözden kaçmış: Adım 1'de
kabukları `SidebarShell`e döndü, içerikleri hiç elden geçmedi.

| Rota | Ham satır |
| --- | --- |
| `/rep` (plasiyer panosu) | 16 |
| `/rep/ziyaret` | 28 |
| `/rep/tahsilat` | 13 |
| `/` (kök giriş sayfası) | 5 |

Paylaşılan bileşen: `components/target-scorecard.tsx` (5).

**Yeni adım numarası açın** (Adım 7b ya da 11) ve REDESIGN.md'ye yazın —
sessizce Adım 7'ye karıştırmayın, sonraki devir teslim yanlış okur.

### Adım 9 — Mobil

`apps/mobile`, aynı palet ve tipografi. NativeWind'in iki tuzağı için hafıza
notu `b2b-theme-engine`. **Adım 46 tema motoru geri alınmıştı** — geri
getirmeyin, o not nedenini yazıyor.

### Adım 10 — Temizlik

- Ham sınıfları sıfıra indir. `documents/**` **hariç**: kâğıt her zaman beyaz,
  anlamsal token koyu temada döner ve çıktı beyaz-üstüne-beyaz olur.
- **Kiracı marka adını kabuğa bağla.** `SidebarShell`in `brand`i şu an sabit
  "B2B Portal". `loadTenant()` → `seller.tradeName ?? seller.legalName`.
  `loadTenant()` `TENANT_DIR` yoksa fırlatıyor, sunucu tarafında yakalayıp
  yedeğe düşen küçük bir yardımcı gerekiyor.
- Genel arama (Ctrl+K): ürün, firma, sipariş no tek kutudan.

---

## 3. Ekranlardan sonra — altı yığın

### 3.1 Tek gerçek boşluk: test

`b2b-next-plan` madde 10, "SIRADAKİ" işaretli:

- **41 web sayfası testsiz.** Rota işleyicileri test altında (233), **ekranlar
  değil**. `requirePage` yönlendirmeleri elle doğrulanıyor.
- **Tarayıcı seviyesinde e2e yok.** Playwright kurulmadı. `puppeteer-core`
  zaten bağımlılıkta (ekran görüntüsü betiği kullanıyor) — yeni tarayıcı
  indirmeden onun üzerine kurulabilir.
- **`apps/mobile` altında tek test yok.**

### 3.2 Kod bitti, canlıda denenmedi

**ERP'ye sipariş aktarımı** (Adım 62, `c433667`). Kılavuz §43.2 kontrol listesi
hiç koşturulmadı: önce `describeOrderTables`, yedek al, tek sembolik belge,
Vega ekranında gözle doğrula.

⚠ **Bu iş gözetimsiz yapılmaz** — müşterinin ERP'sine gerçek yazma.

### 3.3 Dış bağımlılık bekliyor

| İş | Neyi bekliyor |
| --- | --- |
| Sanal POS gerçek adaptörü | Sağlayıcı seçimi + sözleşme + anahtar. Arayüz hazır, kalan tek dosyalık adaptör + 3-D Secure dönüş + webhook rotaları |
| iOS | Mac yok, hiç koşmadı |
| ~~E-fatura~~ | **b2b'nin işi değil** (2026-08-24 kararı): müşterinin ERP'si GİB'e gönderiyor, biz belgeyi ERP'ye doğru yazıyoruz |

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
+ otomatik blokaj · holding/şube konsolidasyonu · matrix katalog · çoklu dil ·
dışa açık B2B API + webhook + OpenAPI · temsilci devir defteri · sunum/maskeleme
modu.

---

## 4. Arayüz ve altyapı önerileri

Bunlar listede yoktu; bugün kodu ve ekran görüntülerini okurken çıktı. Her
maddenin altında **neden** ve **kanıt** var — gerekçesi zayıf olanı atın.

### 4.1 Test artığı gösterim veritabanını kirletiyor ★

Rota testleri gerçek DB'ye yazıyor ve temizlemiyor. Bugün sayıldı:

```
User      email like '%@test.local'     → 23
Category  name like 'Kategori %'/'S7 %' →  4
Company   name like '%rmamta%'/'%acctmt%' → 2
```

İki zarar: **(1)** kullanıcı ekranının görüntüsünde 15 tane "Yeni Plasiyer" ve
`plasiyer-acctmtbh3rwy588@test.local` var — bu görüntü müşteriye gösterilemez;
**(2)** `db:seed-demo` sonrası kurulum kirli açılıyor.

Çözüm: test harness'ına `afterAll` temizliği ya da testleri ayrı bir şemaya
(`SEARCH_PATH=test`) almak. İkincisi daha sağlam — yarıda kalan bir test
temizlik yapamaz.

### 4.2 Uzun tabloda başlık kayboluyor ★

Güvenlik kaydı 3530px, kategoriler 3648px, kullanıcılar 3567px. Sayfanın
ortasında bir rakam sütununa bakarken hangi sütun olduğunu söyleyen şey yok.

`THead`e `sticky top-0 z-10` — **tek satır**, her uzun tabloya birden yansır.
`Table`ın `overflow-x-auto` sarmalayıcısıyla çakışmadığını doğrulayın.

### 4.3 Yönetim tabloları sıralanamıyor ★

55 kategori, 2654 ürün, 35 kullanıcı — hiçbiri başlığa tıklanarak
sıralanamıyor. Vitrin tarafında istemci sıralaması Adım 21'de gelmişti,
yönetimde hiç yok.

`Th`e opsiyonel `sortKey` + `Table`a bir sıralama durumu. Sunucuya gitmeye
gerek yok, listeler zaten tek istekte geliyor.

### 4.4 Kaydetme sessiz ★

Kategori adını değiştirin — hiçbir şey "kaydedildi" demiyor, liste sessizce
tazeleniyor. Duyuru yayınlayın, aynı. `ErrorLine` var ama **başarının
karşılığı yok**; her mutasyonun `onSuccess`i yalnızca `invalidateQueries`
çağırıyor.

Paylaşılan bir `Toast` ya da satır içi "kaydedildi" ipucu. Tasarım dilinde
karşılığı: yeşil, küçük, kendiliğinden sönen — kutu değil.

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

### 4.10 Uzun listeler için sayfalama deseni tek değil

Güvenlik kaydı imleçli sayfalama kullanıyor, stok defteri "ilk 50" diyor,
kategoriler hepsini basıyor. Üçü de savunulabilir ama **hangisinin ne zaman
kullanılacağı yazılı değil**. Adım 10'da bir kural yazın.

---

## 5. Özellik önerileri

Bunlar da bugün koda bakarken çıktı ve **hiçbiri backlog'da yok** — 2026-08-27'de
`schema.prisma` ve `packages/services` üzerinde tek tek arandı, yedisinin de
karşılığı bulunamadı. Öneri, plan değil: sektörü kullanıcı biliyor, gerekçesi
zayıf olanı atın.

### 5.1 Excel ile toplu fiyat/stok güncelleme ★★★

**En büyük pratik boşluk.** XLSX **yazıcı** var (Adım 58); okuyucu yok, hiçbir
yerde içe aktarma yok (`parseXlsx|readXlsx|importC|csvImport|bulkUpsert` → sıfır
eşleşme).

Kanıt kurulum sihirbazının kendisinde: *"Ürünler ve varyantlar — 2673 varyant"*,
*"Fiyatlar — 10669 fiyat satırı"*. Sihirbaz "her varyanta liste fiyatı,
gerekiyorsa grup bazlı kademe gir" diyor. Gerçek bir müşteri 2673 varyanta 4'er
fiyatı **ekrandan tek tek giremez** — ve toptancıda zam ayda bir gelir, toplu
gelir.

Yeni müşteri devreye almanın önündeki en somut engel bu. Yazıcı zaten var,
simetrisi eksik:

```
dışa aktar → Excel'de düzelt → içe aktar → FARK ÖNİZLEMESİ → onayla → uygula
```

**Fark önizlemesi pazarlık konusu değil.** Bir dosyayı doğrudan uygulamak,
yanlış sütuna kaymış bir kopyalamanın bütün kataloğu bir kuruşa satması demek.
Önizleme "142 fiyat değişecek, 3 yeni satır, 1 satır tanınmayan SKU" demeli.
İçe aktarma denetim kaydına yazılmalı (kim, kaç satır, hangi dosya).

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

| Fikir | Durum | Neden |
| --- | --- | --- |
| **Minimum sipariş tutarı/koli** | yok | Toptanda standart. Firma başına ya da genel; tek alan + sepette tek kontrol |
| **Sipariş kesim saati (cut-off)** | yok | Gıda toptanında "16:00'dan sonrası yarına". Sevkiyat planını o belirliyor |
| **Zamanlı fiyat değişimi** | yok | "1 Eylül'den itibaren zam". `Price`'ta `validFrom` yok; `Job` zamanlayıcı hazır |
| **Backorder / bekleyen bakiye** | yok | Kısmi sevkiyat var (`quantityShipped`), ama "40 koli bekliyor, mal gelince sevk et" takibi yok |
| **`Order.source`** | yok | Sipariş web'den mi, mobilden mi, plasiyerden mi geldi — tek enum alanı, sonrası rapor kırılımında bedava |

### 5.10 Kampanya simülatörü

*"Bu kampanyayı açsaydım geçen ayki siparişlerde ne kadar indirim verirdim?"*

Promosyon motoru **ve** sipariş geçmişi ikisi de var; motoru geçmiş siparişlere
kuru kuruya koşturmak yetiyor. Pahalı bir hatayı yayına almadan yakalar.

### 5.11 WhatsApp bildirim kanalı

Backlog'da "bildirim motoru: FCM + SendGrid/Twilio" yazıyor. Türkiye'de bayiyle
asıl konuşulan kanal WhatsApp; e-posta okunmuyor. Business API ücretli ve onay
istiyor — **karar kullanıcının**, ama kanal soyutlaması yazılırken hesaba
katılmalı ki sonradan üçüncü bir kanal eklemek her çağrı yerine dokunmasın.

---

## 6. Yönetici panosu — işletme zekâsı katmanı ★★★

**Kullanıcının 2026-08-28 isteği:** *"şirketin anlık durumunu, büyüme
sistematiğini matematiksel olarak hesaplayıp master admin kullanıcısına rapor
olarak ekranda versin — Vega'nın rapor sistemi gibi."*

### 6.1 Bu, rapor tasarımcısının yerine geçmez

| | Rapor tasarımcısı (var) | Yönetici panosu (yeni) |
| --- | --- | --- |
| Ne | Kullanıcı tanımlı | Küratörlü |
| Nerede | **Veri** (`ReportDefinition`) | **Kod** |
| Soru | "Şu sütunları şuna göre grupla" | "Neden büyüdük?" |

Büyüme matematiği bir sütun listesi değil: kohort matrisi, regresyon eğimi ve
köprü grafiği kullanıcının kuracağı şeyler değil. İkisini tek motora sıkıştırmak
ikisini de bozar.

**Ama veri kümesi kayıt defterini paylaşırlar.** Güvenlik sınırı orada
(`report-registry.ts`, 9 küme: ORDERS · ORDER_ITEMS · LEDGER · COMPANIES ·
CHECKINS · CASH · STOCK · STOCK_LOTS · PROMOTIONS). Panonun kendi ham SQL'i
olmayacak.

### 6.2 Marj hesaplanabilir

`ProductVariant.costPrice` var (ERP'nin `ALISFIYATI`'ndan, şemada *"müşteriye
gösterilmez — kâr raporu ve ..."* diye not düşülmüş). Yani panonun en değerli
yarısı — **kâr, marj, ürün kârlılığı** — bugün hesaplanabilir. Çoğu B2B
panosunun yapamadığı şey bu.

### 6.3 Bölümler

Sekmeler **URL'de** (`?bolum=durum|buyume|musteri|urun|nakit|gidisat`) — ekran
görüntüsü kuralı gereği; fotoğraflanamayan ekranın doğru göründüğü söylenemez.

**A. Anlık durum** — bu ay ciro / geçen yıl aynı ay · hedefe göre gidişat · açık
sipariş · sevk bekleyen · toplam alacak + vadesi geçmiş · kasa/banka bakiyesi ·
çek portföyünde bu ay tahsil edilecek · maliyetle stok değeri · brüt marj %.

**B. Büyüme**
- Aylık ciro serisi + 3 aylık hareketli ortalama (gürültüyü ayırmak için)
- **YoY**, MoM değil — gerekçe §6.5
- Trend eğimi (en küçük kareler): "aylık ortalama +X TL"
- CAGR — yalnızca yeterli veri varsa
- **Ciro köprüsü.** Geçen dönem → bu dönem farkı dörde ayrılır: yeni müşteri (+),
  kaybedilen müşteri (−), mevcut büyüyen (+), mevcut daralan (−). **Panonun en
  öğretici tek grafiği** — "neden büyüdük/küçüldük" sorusunu tek bakışta
  cevaplayan şey bu, toplam ciro çizgisi değil.

**C. Müşteri**
- **RFM segmentasyonu**: Recency / Frequency / Monetary → çeyrekliklere böl →
  şampiyon · sadık · riskli · uykuda · kayıp
- **Kohort tutundurma**: ilk siparişini şu ayda veren firmaların kaçta kaçı
  sonraki aylarda hâlâ alıyor
- **Konsantrasyon riski**: Pareto eğrisi + HHI. "Cironun %80'i 12 firmadan" —
  tek müşteri kaybının ne kadar acıtacağını söyleyen sayı
- **Sessizleşen müşteri uyarısı** — dikkat: eşik **sabit 90 gün olmamalı**.
  Firmanın kendi normal sipariş periyodunun 2 katı. Haftalık alan bayi için 30
  gün zaten alarmdır, mevsimlik alan için değildir. Sabit eşik ikisini de yanlış
  bildirir.

**D. Ürün ve stok**
- ABC analizi (ciro Pareto)
- Stok devir hızı = SMM / ortalama stok · DIO = 365 / devir
- Ölü stok: X gündür hareketsiz, **maliyet değeriyle** (`StockMovement` defteri
  bu soruyu zaten cevaplayabiliyor)
- **Ciro × marj matrisi**: çok satan ama düşük marjlı ürünler. Fiyat kararının
  doğduğu yer burasıdır

**E. Nakit ve alacak**
- **DSO** = (ortalama alacak / dönem cirosu) × gün
- Yaşlandırma dağılımı **ve trendi** — tek fotoğraf değil, kötüleşiyor mu
- Tahsilat performansı: vadesinde ödenen oranı, firma bazlı ortalama gecikme
- Çek vade takvimi: önümüzdeki 90 gün, haftalık
- Karşılıksız çek oranı

**F. Gidişat**
- Ay sonu projeksiyonu: ayın kaçıncı **iş gününde** ne kadar yapıldı →
  mevsimsel indeksle ay sonu tahmini
- Hedefe göre pace (`SalesTarget` var; Adım 34'ün hedef kartı bunun kardeşi)

### 6.4 Mimari kararlar

1. **Gecelik özet (`AnalyticsSnapshot`).** Kohort matrisi ve RFM her sayfa
   açılışında hesaplanamaz. `Job` zamanlayıcı zaten var (Adım 43): gecelik iş
   hesaplar, ekran okur. **Anlık kutular canlı** okunur — "bugünün cirosu" dün
   geceden olamaz. Hangi sayının bayat olabileceği ekranda yazmalı ("gece
   03:00 itibarıyla").
2. **Toplama SQL'de, matematik JS'te.** Adım 18 deseni (`GROUP BY` veritabanında)
   + Adım 56 kuralı (formül SQL'e gitmez). Regresyon, kohort matrisi ve HHI
   JS'te.
3. **Yeni izin `analytics.view`, rol değil** (Adım 30 kuralı). Maliyet ve marj bu
   ekranda; `costPrice` müşteriye gösterilmiyor, plasiyere de gösterilmemeli —
   backlog'daki "sunum/maskeleme modu" bunun kardeşi.
4. **Her kutu kaynağına bağlanır.** Bir sayıya tıklayınca onu üreten satırlara
   gitmeli. Yoksa yönetici sayıya güvenmez — ve haklıdır. Rapor tasarımcısı o
   listeleri zaten çizebiliyor.

### 6.5 İki dürüstlük kuralı

**Az veriyle yalan söyleme.** Üç aylık veriyle CAGR göstermek uydurmadır. Her
göstergenin bir **minimum veri şartı** olmalı ve karşılanmıyorsa sayı yerine
*"yeterli veri yok — en az N ay gerekiyor"* yazmalı. Bir panonun en kolay yalan
söylediği yer burasıdır: boş veriden çıkan bir yüzde de bir yüzde gibi görünür.

**Mevsimsellik esas.** Toptan gıdada MoM karşılaştırma yanıltıcı — ramazan, yaz,
okul dönemi. Varsayılan karşılaştırma **YoY ve aynı dönem**. MoM gösterilecekse
"mevsimsellik arındırılmamış" diye işaretlenmeli.

### 6.6 Açık soru — Vega

Kullanıcı *"Vega'nın rapor sistemi gibi"* dedi. **Vega'nın rapor ekranları
depoda yok** (`docs/` altında yalnızca kurulum/sunum/teklif var; `apps/erp-agent`
şema okuyor, rapor değil). Hafızadaki `b2b-vegadb` doğrulanmış **tablo** şeması,
rapor ekranı değil.

Yani hangi Vega raporunun karşılığının istendiği **bilinmiyor**. Yukarıdaki
liste sektör standardı yönetici panosu; Vega'ya özgü bir rapor isteniyorsa
kullanıcıdan ekran görüntüsü ya da rapor adı istenmeli. **Tahmin edip
uydurmayın** — soruyu KALAN-ISLER.md'ye not düşüp genel panoyla devam edin.

---

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

# 1. Kod
# 2. Doğrulama — CI tam bu sırayı çalıştırıyor
pnpm typecheck && pnpm lint && pnpm test && pnpm build

# 3. Ekran görüntüsü (derlemeden AYRI sırada!)
pnpm --filter web dev -p 3100          # `--` KOYMAYIN
SHOT_BASE_URL=http://localhost:3100 pnpm shots -- --step <n>

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

## 9. FEATURES.md bayat

`Bilinen Eksikler` bölümü bitmiş dört işi hâlâ eksik gösteriyor. Bugün kodda
doğrulandı:

| FEATURES.md diyor | Gerçek |
| --- | --- |
| "Görsel işlenmiyor · S3/MinIO sürücüsü yok" | `packages/services/src/storage.ts` + `storage-config.ts` var (2026-08-26) |
| "Hediye kademesi tek seviyeli" | `GIFT_TIER` + `PERCENT_OFF_TIER` var (Adım 55) |
| backlog: "İade & değişim (RMA)" | `/admin/iadeler` var (2026-08-26) |
| "Arayüz Faz 3 kalanı" | Adım 53'te kapandı |

Son güncelleme `d43dd65` (2026-08-26). Ondan sonraki işler (S3 sürücüsü, RMA
ekranı, barkod okuyucu, 2FA artıkları) ve **yenilemenin Adım 1-6'sının tamamı**
FEATURES.md'ye hiç girmemiş.

**Bir tur güncelleyin** — devir teslim dosyası olarak tutuluyor ve şu hâliyle
yanlış yönlendiriyor.

---

## 10. Önerilen sıra

Bağımlılık ve maliyet/etki sırası; söz değil.

1. **Adım 7** — rapor tasarımcısı ve panolar (7 ekran). En karmaşığı, dinç
   kafayla.
2. **Adım 8 kalanı** — `hesabim`, `403` (2 ekran, küçük).
3. **Saha üçlüsü + kök** (4 ekran). Yeni adım numarası açıp REDESIGN.md'ye yaz.
4. **§4.1 test artığı temizliği** — ondan sonraki her ekran görüntüsü temiz
   çıkar; erken yapmanın getirisi var.
5. **Adım 10 temizlik** — ham sınıflar sıfıra, kiracı marka adı, §4.2/4.3/4.4.
6. **FEATURES.md güncellemesi** (§9).
7. **§6 yönetici panosu.** Adım 7 bittikten *sonra*: rapor ekranlarının ortak
   dili ve grafik bileşenleri o adımda oturuyor, pano onların üstüne biniyor.
   Önce §6.4'teki dört mimari kararı yazıp öyle başlayın.
8. **§5.1 Excel içe aktarma** — özellik önerilerinin en getirilisi, gözetim
   gerektirmiyor.
9. **§3.1 test boşluğu** — sayfa testleri, sonra `puppeteer-core` üstünde e2e.
10. §5'in kalanı ve §3.6 backlog — iş kararı bekliyor.
