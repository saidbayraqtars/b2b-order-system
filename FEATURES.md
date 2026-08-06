# Özellik Envanteri

B2B Sipariş & Yönetim Sistemi'nde **şu an çalışan** özelliklerin listesi.

> **Güncelleme kuralı:** Her adım/commit sonunda bu dosya güncellenir. Bir özellik
> buraya ancak kodda çalışır durumdayken eklenir — planlananlar en alttaki
> "Sonraki Adımlar" bölümünde durur.

Son güncelleme: 2026-08-06 · Adım 24 (ödeme yöntemi & vade) sonu

---

## Adım Durumu

| Adım | Kapsam | Durum |
|------|--------|-------|
| 1 | Mimari + monorepo iskeleti | ✅ |
| 2 | Altyapı: Postgres, Prisma şema, seed | ✅ |
| 3 | Kimlik doğrulama + RBAC | ✅ |
| 4 | Web portal: fiyatlama, katalog, sepet, sipariş, onay akışı, admin panel | ✅ |
| 5 | Mobil (Expo): plasiyer + müşteri, GPS ziyaret, tahsilat | ✅ |
| 6 | Katalog yönetimi: ürün/varyant/fiyat/kategori/iskonto CRUD | ✅ |
| 7 | Sipariş yaşam döngüsü: sevkiyat akışı, iptal, durum geçmişi, sipariş detayı | ✅ |
| 8 | Cari ekstre + yaşlandırma + satış/ürün/plasiyer/tahsilat raporları | ✅ |
| 9 | Rapor tasarımcısı: kullanıcının kendi raporunu kurması, kaydetmesi, paylaşması | ✅ |
| 10 | Firma, adres, kullanıcı ve müşteri grubu yönetimi (seed bağımlılığı bitti) | ✅ |
| 11 | Güvenlik: her istekte canlı yetki kontrolü, oturum iptali, hesap self-servis, denetim kaydı | ✅ |
| 12 | Promosyon motoru: kural tabanlı kampanya (koşul + aksiyon + kupon), sunucu tarafı sepet fiyatlaması | ✅ |
| 13 | Kalite altyapısı: ESLint, birim + entegrasyon testleri, GitHub Actions CI | ✅ |
| 14 | Belgeler: irsaliye/fatura numaralandırma, kısmi sevkiyat, kısmi faturalama, fatura bazlı vade, nakliye bedeli | ✅ |
| 15 | E-posta altyapısı, "şifremi unuttum", sipariş/durum/fatura bildirimleri | ✅ |
| 16 | Sunucu tarafı sepet + ürün görseli yükleme | ✅ |
| 17 | Kampanya v2: hediye ürün, nakliye indirimi, koşullarda VEYA, mobilde kupon | ✅ |
| 18 | Rapor v2: veritabanı tarafında gruplama, ilişkili tablo alanları | ✅ |
| 19 | Güvenlik sertleştirme: IP hız sınırı, denetim saklama/dışa aktarma, hareket akışı, principal önbelleği | ✅ |
| 20 | Arayüz yenilemesi Faz 1: tasarım token'ları, koyu tema, paylaşılan bileşenler, tek uygulama kabuğu | ✅ |
| 21 | Vitrin Faz 2: endüstriyel/teknik kimlik, ürün detay sayfası, kategori+sıralama, vitrin duyuruları | ✅ |
| 22 | Vekaleten sipariş: plasiyer/süper admin müşteri adına sipariş girer (firma seçici + portföy izolasyonu) | ✅ |
| 23 | Saha işlemleri web'de: tahsilat girişi + iptal kaydı, ziyaret aç/kapat, tahsilat şekli ayrı enum | ✅ |
| 24 | Ödeme yöntemi + vade: 5 yöntem, isimli vade tanımları, firmaya özel menü, ödemede seçim | ✅ |

---

## 1. Altyapı & Mimari

- **Turborepo + pnpm workspace** monorepo. Uygulamalar `apps/*`, paylaşılan kod `packages/*`.
- **Paketler:** `@repo/database` (Prisma client + şema + seed), `@repo/types` (Zod şemaları + tip literalleri), `@repo/auth` (Auth.js config + edge-safe RBAC), `@repo/services` (domain katmanı), `@repo/eslint-config`, `@repo/tsconfig`.
- **Uygulamalar:** `apps/web` (Next.js 14 App Router — hem portal hem API), `apps/mobile` (Expo SDK 51 / RN 0.74).
- **Postgres** Docker'da (host portu **5433**), Prisma migration'ları ile versiyonlu.
- Domain katmanı Prisma'ya bağımlı; edge'de çalışan kod (middleware, RBAC) Prisma'dan tamamen ayrı — edge runtime bozulmuyor.

## 2. Veri Modeli

| Model | İşlev |
|-------|-------|
| `User` | 4 rol, bcrypt şifre, firma üyeliği, plasiyer portföyü (`managedCompanies`), oturum sürümü (`tokenVersion`), giriş telemetrisi ve kilit alanları |
| `AuditLog` | Salt-ekleme güvenlik kaydı: kim, ne yaptı, hangi kayda, IP + tarayıcı. Kullanıcı silinse de e-posta denormalize saklandığı için okunabilir kalır |
| `Company` | Cari hesap: kredi limiti, güncel bakiye, **vade günü**, para birimi, sipariş onayı zorunluluğu, müşteri grubu, atanmış plasiyer, ödeme yöntemi/vade menüsü, hacim iskontosu modu |
| `PaymentTerm` | İsimli vade tanımı ("30 gün"); firmalara m-n bağlanır, sipariş gün sayısını kopyalar |
| `VolumeTier` | Hacim iskontosu basamağı: dönem (ay), alt ciro sınırı, oran. Merdiven geneldir, firma hak ettiği en yüksek oranı alır |
| `Address` | Firma adresleri, varsayılan adres işareti |
| `CustomerGroup` | Fiyat kademesi grubu (Bayi, Toptancı, Zincir Market) |
| `Category` | Ağaç yapılı kategori (self-referans `parentId`) |
| `Product` / `ProductVariant` | Ürün + varyant (SKU, barkod, renk, beden, koli adedi, min sipariş, stok) |
| `Price` | Varyant × müşteri grubu × miktar kademesi fiyatı |
| `CompanyDiscount` | Firmaya özel iskonto (ürün veya kategori bazlı, yüzde ya da sabit) — pazarlıkla verilen oran; cirodan kazanılan `VolumeTier` |
| `Order` / `OrderItem` | Sipariş başlığı + kalemler, fiyat anlık görüntüsü ile; nakliye bedeli/indirimi, kargo/takip no, sevk/teslim/iptal zaman damgaları. Kalemde sevk edilen/faturalanan miktar ve hediye işareti |
| `OrderStatusHistory` | Her durum geçişi: nereden nereye, kim, ne zaman, not (append-only) |
| `DocumentSeries` | Belge serisi: tür (irsaliye/fatura), ön ek, basamak, son verilen numara, varsayılan mı, numarayı ERP mi veriyor (`externalOnly`) |
| `Shipment` / `ShipmentItem` | İrsaliye başlığı + sevk edilen miktarlar; sipariş durumu buradan türetilir |
| `Invoice` / `InvoiceItem` | Fatura başlığı + faturalanan miktarlar; para yeniden hesaplanmaz, sipariş satırından pay alınır. Vade tarihi burada doğar |
| `Transaction` | Cari defter (DEBIT/CREDIT), siparişe ve kaydeden kullanıcıya bağlı; `dueDate` fatura kesilince damgalanır. Tahsilatta `collectionMethod` (nakit/havale/çek…), iptal kaydında `reversalOfId` (tekil — bir tahsilat iki kez iptal edilemez) |
| `CheckIn` | Plasiyer saha ziyareti (GPS, giriş/çıkış saati, not) + `source` (MOBILE/WEB — sunucu belirler) |
| `ReportDefinition` | Kullanıcı tanımlı rapor: veri kümesi + sütun/filtre/gruplama/dizayn (JSON), sahip, paylaşım |
| `Promotion` | Kampanya: koşul + aksiyon listeleri (JSON), koşul modu (VE/VEYA), kupon kodu, tarih penceresi, öncelik, tekillik, kullanım kotaları |
| `PromotionRedemption` | Hangi kampanya hangi siparişe ne kadar indirim verdi — aynı zamanda kota sayacı |
| `Cart` / `CartItem` | Sunucudaki sepet: **(firma, sahip)** başına tek satır, yalnızca varyant + adet tutar. Fiyat okurken çözülür |
| `PasswordResetToken` | "Şifremi unuttum" bileti: yalnızca token'ın SHA-256'sı, son kullanma ve harcanma zamanı |

- Para birimi alanları `Decimal(14,2)`; hesaplamalar `Prisma.Decimal` ile, float yok.
- `Price` varsayılan kademesi için **kısmi unique index** (`Price_variant_default_tier_key`) — Prisma ifade edemediği için elle SQL migration.
- `Order.promotionTotal` + `Order.couponCode` ve `OrderItem.promotionDiscount`: kampanya indirimi de fiyat gibi sipariş anında donuyor.
- Seed: 4 rol için demo kullanıcı, 1 firma, kategoriler, ürün + varyantlar, grup fiyatları, 4 örnek rapor tanımı, 2 örnek kampanya. Tümü upsert — yeniden çalıştırılabilir.

## 3. Kimlik Doğrulama & Yetkilendirme

- **Web:** Auth.js v5, Credentials provider, JWT cookie session.
- **Mobil:** aynı `AUTH_SECRET` ile imzalanmış 30 günlük HS256 JWT, `Authorization: Bearer`.
- `requireUser()` **her ikisini de** kabul ediyor → tek endpoint seti hem portalı hem uygulamayı besliyor.
- **4 rol:** `SUPER_ADMIN`, `COMPANY_ADMIN`, `COMPANY_STAFF`, `SALES_REP`.
- **3 katmanlı savunma:**
  1. Edge middleware — sayfa öneklerini role göre kapatır, `/login`'e ya da `/403`'e yönlendirir. **Ön filtredir, karar mercii değildir:** edge'de veritabanı yok, elindeki tek şey imzalı çerez.
  2. `requirePage()` — Server Component'lerde canlı hesap + rol kontrolü (yönlendirir).
  3. `requireUser()` — route handler'larda canlı hesap + rol kontrolü (JSON 401/403 döner).
- **Her istekte hesap yeniden okunuyor (Adım 11).** Oturum jetonu geçmişte bir kez giriş yapıldığının kanıtıdır; hesabın hâlâ var olduğunun, açık olduğunun ya da aynı role sahip olduğunun değil. Rol ve firma **veritabanından** okunur, jetondan değil. `react/cache` ile istek başına tek sorgu.
- `resolveCompanyId()` — istenen firmayı role göre yetkilendirir: kendi firması / plasiyer portföyü / admin herhangi biri.
- `BusinessError` kodları → HTTP durumlarına merkezî eşleme (`withAuthErrors`). 401'ler makine okunur kod taşır (`SESSION_REVOKED`, `ACCOUNT_DISABLED`, `ACCOUNT_MISSING`) — mobil istemci jetonu buna bakarak siliyor.

## 4. Fiyatlandırma

- **Grup + miktar kademeli fiyat:** firmanın müşteri grubuna özel fiyat varsa o, yoksa varsayılan kademe. Kademe = `minQuantity <= miktar` olanların en yükseği (eşitlikte en ucuz fiyat).
- **Firmaya özel iskonto:** ürün bazlı iskonto kategori bazlıyı ezer. Yüzde veya sabit tutar, birim başına, 0'ın altına inmez.
- Katalog fiyatları sunucuda firmaya göre çözülür — istemci hiç fiyat hesaplamaz.
- Fiyatı tanımsız varyant sipariş edilemez (katalogta "Fiyat tanımsız" olarak işaretlenir).
- **Kampanya indirimi** (Adım 12) bu ikisinin üzerine, satır bazında uygulanır — ayrıntı için bölüm 12.

## 5. Sipariş

- **Satır doğrulama:** minimum sipariş miktarı, koli katı olma zorunluluğu, stok yeterliliği — her biri ayrı hata kodu döner.
- **Toplamlar:** ara toplam, iskonto toplamı, kampanya toplamı, KDV, genel toplam — hepsi Decimal. KDV kampanya sonrası net üzerinden hesaplanır.
- **Fiyatlama tek yerde:** doğrulama + fiyat + kampanya + KDV hesabı `buildQuote` içinde; hem sepet önizlemesi hem sipariş oluşturma onu çağırır, sipariş anında transaction içinde yeniden çalışır.
- **Durum akışı:** firma onay istiyorsa + oluşturan personelse → `PENDING_APPROVAL`; açık hesap + limit aşımı → `PENDING_CREDIT`; aksi halde `CONFIRMED`. Kredi kartı cari borç yazmaz.
- **Stok** tüm reddedilmemiş siparişlerde (bekleyenler dahil) oluşturma anında düşülür; red halinde iade edilir.
- **Cari borç** yalnızca `CONFIRMED` + açık hesapta yazılır — bekleyen siparişler onay anında borçlanır.
- Sipariş numarası `ORD-YYYYMMDD-NNNN`, yarış durumunda 2 kez yeniden dener.
- Tamamı tek transaction içinde — stok, borç ve bakiye asla birbirinden ayrışmaz.

### Onay akışı
- `PENDING_APPROVAL` → firma yöneticisi (kendi firması) veya süper admin onaylar → kredi kontrolü → `CONFIRMED` ya da `PENDING_CREDIT`.
- `PENDING_CREDIT` → **sadece süper admin** onaylayabilir (limit aşımı override).
- Red → `REJECTED` + stok iadesi.

### Sevkiyat akışı (Adım 7)
- Geçiş haritası: `CONFIRMED → PROCESSING → SHIPPED → DELIVERED`. `CONFIRMED` ve `PROCESSING` iptal edilebilir; **sevk edildikten sonra iptal yok**. `DELIVERED`, `CANCELLED`, `REJECTED` uçtur.
- `DRAFT` buradan `CONFIRMED` yapılamaz — onay kredi kontrolü gerektirir, o da sipariş/onay servisinde.
- **Yetki:** sevkiyat durumlarını yalnızca süper admin değiştirir. İptali süper admin ya da siparişi veren firmanın yöneticisi (sadece sevkten önce) yapabilir.
- **İptal geri alır:** tüm kalemler stoğa iade edilir ve cari borç yazılmışsa ters kayıt (CREDIT) ile bakiye eski haline döner. Kredi kartı siparişinde cariye dokunulmaz — ters kayıt varsayımla değil, gerçek DEBIT satırı aranarak yazılır.
- `SHIPPED` geçişinde kargo firması + takip numarası kaydedilir; `shippedAt` / `deliveredAt` / `cancelledAt` damgalanır.
- **Durum geçmişi** (`OrderStatusHistory`): oluşturma anı dahil her geçiş, kim ve ne zaman yaptığı ve opsiyonel notuyla append-only tutulur.
- API sipariş detayında `availableTransitions` döner — arayüz butonları buna göre çizer, yetkisiz seçenek hiç görünmez.

## 6. Cari & Tahsilat

- Firma bazlı cari defter: sipariş borcu (DEBIT) ve tahsilat (CREDIT) kayıtları.
- `Company.currentBalance` defterden türeyen önbellek — her yazma aynı transaction içinde güncellenir.
- Saha tahsilatı: plasiyer/admin tutar + **tahsilat şekli** (nakit/havale/çek/senet/kart/diğer) + açıklama girer, bakiye anında düşer. Web ekranı için bkz. Adım 23.
- **Tahsilat iptali ters kayıtla** yapılır: aynı tutarda DEBIT satırı orijinali işaret eder, ikisi de ekstrede kalır. Silme yok — defter salt-ekleme.
- Kullanılabilir limit = kredi limiti − güncel bakiye; katalog ve müşteri listesinde görünür.

### Cari ekstre & yaşlandırma (Adım 8)
- **Ekstre:** tarih aralığı filtreli hareket listesi; açılış bakiyesi, satır satır yürüyen bakiye, borç/alacak toplamları ve kapanış bakiyesi. Sipariş kaynaklı satırlar sipariş detayına linkli.
- Ekstre **yalnız defteri okur** — kapanış bakiyesi ile `currentBalance` önbelleği ekranda yan yana durur, sapma olursa görünür.
- **Yaşlandırma (FIFO):** fatura tablosu olmadığı için açık kalemler DEBIT satırlarının kendisidir; tahsilatlar **en eski borçtan başlayarak** mahsup edilir (Türkiye'deki açık hesap mutabakatı böyle yapılır).
- Vade = borcun tarihi + firmanın `paymentTermDays` değeri. Kalan borç gecikme gününe göre kovalanır: vadesi gelmemiş · 1-30 · 31-90 arası · 90+.
- Borcu aşan tahsilat negatif borç olarak değil, **mahsup edilmemiş alacak (avans)** olarak raporlanır.
- **CSV dışa aktarım:** noktalı virgül ayraç + virgüllü ondalık + UTF-8 BOM — Türkçe Excel sihirbaz sormadan açar.

## 7. Katalog Yönetimi (Adım 6)

Süper admin, ürün ağacını uygulama içinden yönetir — seed'e bağımlılık kalktı.

- **Kategori:** ağaç yapılı oluştur/yeniden adlandır/taşı/sil. Slug isimden türetilir (Türkçe karakter duyarlı: "Şişe & Kapak" → `sise-kapak`), çakışırsa `-2`, `-3` eklenir. Kendi altına taşıma engelli (döngü koruması). Alt kategorisi, ürünü veya iskontosu olan kategori silinemez.
- **Ürün:** ad, kategori, marka, KDV (%1/10/20), açıklama, görsel listesi, aktif/pasif. Pasif ürün katalogdan düşer ama geçmiş siparişlerde durur.
- **Varyant:** SKU, barkod, renk, beden, koli içi adet, minimum sipariş, stok. SKU ve barkod benzersizliği kontrol edilir. Stok satır içinde düzenlenir (yalnız blur/Enter'da yazar).
- **Fiyat kademesi:** varyant × müşteri grubu × minimum adet → fiyat. Aynı üçlü tekrar yazıldığında hata vermez, günceller (upsert). Grup seçilmezse varsayılan liste fiyatı olur. Fiyatı olmayan varyant listede uyarı ile işaretlenir.
- **Firma iskontosu:** firma detay sayfasında kategori **veya** ürün hedefli, yüzde ya da sabit tutar. Aynı satırda ikisi birden seçilemez (çözümleme ürünü kategoriye tercih eder), yüzde 100'ü aşamaz.
- **Silme kuralı:** siparişte kullanılan ürün/varyant asla silinmez (`IN_USE`) — pasife alınır, sipariş geçmişi bozulmaz.

## 8. Raporlama (Adım 8)

Tümü tek tarih aralığıyla çalışır; sekme değiştirmek pencereyi değiştirmez.

- **Satış:** ciro, sipariş adedi, ortalama sepet, günlük ciro grafiği (bar'lar CSS ile — grafik kütüphanesi yok), duruma göre kırılım, en çok alan firmalar.
  - Ciro = `CONFIRMED · PROCESSING · SHIPPED · DELIVERED`. Bekleyen siparişler "talep" olarak, iptal/red "kayıp" olarak **ayrı** raporlanır — ciroyu şişirmez.
- **Ürünler:** varyant bazında satılan adet, ciro ve kaç ayrı siparişte geçtiği. Ürün adı/SKU sipariş anındaki anlık görüntüden okunur, yeniden adlandırma geçmişi bozmaz.
- **Plasiyer performansı:** portföy büyüklüğü, portföy cirosu, kendi girdiği sipariş sayısı, tahsilat tutarı/adedi, ziyaret sayısı, portföy bakiyesi.
- **Tahsilat:** ödeme yöntemi ve kaydeden kişi kırılımı + hareket listesi. **İptal ters kayıtları hariç** (onlar da CREDIT satırıdır ama tahsil edilmiş para değildir — `orderId` dolu olanlar elenir).
- **Alacak yaşlandırma:** tüm firmaların kova kova alacak dağılımı ve toplamları; firma adından ekstresine gidilir.
- **Kapsam yetkiye göre daraltılır:** plasiyer raporları kendi portföyüne sabitlenir — başkasının `salesRepId`'sini göndermek erişimi genişletmez, kesişimi boşaltır. Plasiyer performansı karşılaştırmalı olduğu için yalnız süper admine açıktır.

## 9. Rapor Tasarımcısı (Adım 9)

Her rapor türünü tek tek kodlamak yerine **rapor tanımı veri olarak** saklanıyor: kullanıcı
istediği alanları seçip kendi raporunu kuruyor, kaydediyor, dizaynını değiştiriyor.

- **Veri kümeleri:** Siparişler · Sipariş kalemleri · Cari defter · Firmalar · Ziyaretler.
- **Alan kayıt defteri (`report-registry.ts`) tek gerçek kaynak ve güvenlik sınırı.** Her alanın etiketi, tipi, veritabanı yolu, gruplanabilirliği ve alabileceği özet fonksiyonları burada tanımlı. İstemciden gelen bir alan adı önce burada aranır — listede yoksa **yok**. Ham alan adı, Prisma yolu veya SQL hiçbir zaman doğrudan sorguya geçmez. Katalog uçtan istemciye verilirken **veritabanı yolu çıkarılır**; arayüzün alanın nereye karşılık geldiğini bilmesine gerek yok.
- **Sütunlar:** ekle/çıkar/sırala, başlık değiştir, genişlik ver, gizle, biçim seç (metin/sayı/para/yüzde/tarih).
- **Özet fonksiyonları:** toplam, adet, benzersiz adet, ortalama, en küçük, en büyük — alanın tipine göre kısıtlı (metne toplam uygulanamaz). `Adet` gruptaki satır sayısıdır (SQL'in `COUNT(*)`'ı), `benzersiz adet` ise boş olmayan farklı değer sayısı.
- **Gruplama:** gruplanabilir alanlara göre; gruplarken her sütun ya gruplama alanı olmalı ya da bir özet almalı — belirsiz çıktı üretilemez. Gruplama alanı sütun listesinde yoksa otomatik başa eklenir. Tarihler gün/ay/yıl olarak da gruplanabilir.
- **Filtreler:** alanın tipine göre operatör listesi (paraya `içerir` uygulanamaz). **Son N gün** filtresi kayan pencere — kaydedilmiş rapor tarihe çakılıp kalmaz.
- **Dizayn tanımın parçası:** sütun sırası/genişliği/görünürlüğü, sayı biçimi ve grafik tipi (tablo/sütun/çizgi/pasta) kayıtla birlikte saklanır. Grafikler CSS/SVG ile çiziliyor — grafik kütüphanesi yok.
- **Canlı önizleme** (kaydetmeden çalıştırma) + CSV dışa aktarım.
- **Paylaşım:** rapor paylaşılabilir. Paylaşılan rapor **çalıştıranın** yetkisiyle çalışır — plasiyer, adminin paylaştığı raporu açtığında yalnız kendi portföyünü görür. Sahibi (ve süper admin) düzenleyip silebilir, diğerleri salt okur.
- **Satır kapsamı zorunlu:** kullanıcının filtreleri ile rolünün kapsamı **VE**'lenir. Portföy dışı bir firmayı adıyla filtrelemek sonucu açmaz, boşaltır.
- **Kaydedilmiş tanım da doğrulanır:** JSON sütunundaki config her çalıştırmada yeniden şema + kayıt defteri kontrolünden geçer — veritabanından elle düzenlenmiş bir satır motoru atlatamaz.
- Seed 4 örnek rapor kuruyor (Aylık ciro · En çok satan ürünler · Firma bakiyeleri · Plasiyere göre tahsilat) — ayrıcalıklı değiller, sıradan tanımlar, aynı zamanda çalışan örnek.

## 10. Firma & Kullanıcı Yönetimi (Adım 10)

Firma, adres, kullanıcı ve müşteri grubu artık uygulama içinden yönetiliyor — sistem
seed'e bağımlı değil, yeni müşteri açmak için veritabanına girmek gerekmiyor.

- **Firma:** ad, vergi/TC no (10-11 hane, benzersiz), vergi dairesi, iletişim, kredi limiti, **vade günü**, para birimi, onay zorunluluğu, müşteri grubu, plasiyer, aktif/pasif. Arama + pasifleri gösterme filtresi.
- **Plasiyer ataması denetleniyor:** yalnızca `SALES_REP` (veya süper admin) rolündeki kullanıcı bir firmaya atanabilir — aksi halde o hesabın okuma kapsamı sessizce genişlerdi.
- **Adres:** firma başına çok adres; **her zaman tam olarak bir varsayılan**. İlk adres otomatik varsayılan olur, başkası varsayılan yapılınca diğerleri düşer, varsayılan silinince kalanlardan biri devralır. Sevk edilmiş siparişi olan adres silinemez.
- **Kullanıcı:** e-posta (benzersiz), ad, telefon, rol, firma, aktif/pasif. Şifre bcrypt ile saklanıyor, **hiçbir yanıtta hash dönmüyor**. Şifre belirleme ayrı uçta — form kaydederken yan etki olarak değişemiyor. Şifre kuralı: en az 8 karakter, harf + rakam.
- **Firma yöneticisi kendi personelini yönetiyor** (`/portal/users`): kendi firmasında `COMPANY_STAFF` ve `COMPANY_ADMIN` açabilir/düzenleyebilir. Yapamadıkları sunucuda kilitli:
  - süper admin veya plasiyer rolü **atayamaz**,
  - başka firmaya kullanıcı **ekleyemez**, başka firmanın kullanıcısını okuyamaz/düzenleyemez,
  - kullanıcıyı firmalar arasında **taşıyamaz**,
  - listeye başka firmanın `companyId`'sini vermek listeyi genişletmez.
- **Kendini kilitleme koruması:** kimse kendi hesabını pasife alamaz, kendi rolünü değiştiremez, kendini silemez. Ayrıca son aktif süper adminin rolü/durumu değiştirilemez (bugünkü kurallarla ulaşılması zor bir emniyet kemeri — pratikte önce "kendi hesabınız" kuralı devreye giriyor).
- **Rol ⇄ firma değişmezi:** `COMPANY_ADMIN`/`COMPANY_STAFF` bir firmaya bağlı olmak zorunda; `SUPER_ADMIN`/`SALES_REP` ise firmasız. Rol veya firma değiştiğinde bu yeniden hesaplanıyor, tutarsız kayıt oluşamıyor.
- **Portföylü plasiyerin rolü değiştirilemez** — önce portföyün devri gerekir, aksi halde firmalar sessizce plasiyersiz kalırdı.
- **Silme yerine pasife alma:** siparişi, cari hareketi, ziyareti, onayı ya da durum değişikliği olan kullanıcı silinemez (denetim izi bozulur). Siparişi, cari hareketi, kullanıcısı veya **sıfırdan farklı bakiyesi** olan firma da silinemez.
- **Müşteri grubu:** ad benzersiz; firması veya fiyat kademesi olan grup silinemez.

## 11. Güvenlik & Hesap (Adım 11)

Adım 10'a kadar yetki kararı oturum jetonundaki role bakıyordu. Jeton web'de haftalarca,
mobilde **30 gün** yaşadığı için bir kullanıcıyı pasife almak, rolünü düşürmek ya da
şifresini sıfırlamak pratikte hiçbir şey yapmıyordu: eski jeton eski yetkileriyle
çalışmaya devam ediyordu. Bu adım o boşluğu kapatıyor.

### Canlı yetki kontrolü — her istekte

- `requireUser()` / `requirePage()` önce jetonun **imzasını** doğruluyor, sonra hesabı **veritabanından** okuyor. Döndürdüğü rol ve firma DB'den geliyor; jetondaki değerler yalnızca iddia sayılıyor.
- Hesap silinmişse → 401 `ACCOUNT_MISSING`. Pasifse → 401 `ACCOUNT_DISABLED`.
- **`tokenVersion`:** her hesapta bir oturum sürümü var. Rol, firma, aktiflik veya şifre değiştiğinde artıyor; o hesabın **tüm** açık oturumları (web çerezi + mobil jeton) anında geçersizleşiyor.
- Reddedilen her oturum ve her yetkisiz istek denetim kaydına yazılıyor (`SESSION_REVOKED`, `ACCESS_DENIED`).
- Web'de ölü oturum `/login?reason=…` adresine düşüyor ve sebebini yazan bir uyarı gösteriyor; mobilde 401 kodunu gören istemci jetonu keychain'den siliyor ve giriş ekranına dönüyor.

### Giriş sertleştirme

- Kimlik doğrulama tek yerde (`attemptLogin`) — web formu ve mobil uç aynı kodu kullanıyor, ayrışamıyorlar.
- **5 hatalı denemede hesap 15 dakika kilitleniyor.** Kilitliyken doğru şifre de girmiyor. Yönetici şifre sıfırlayınca kilit açılıyor.
- **Hata mesajı e-posta sızdırmıyor:** yanlış şifre ile kayıtsız e-posta aynı yanıtı veriyor, kayıtsız e-postada da bcrypt karşılaştırması kadar zaman harcanıyor (zamanlama farkı da cevap vermesin diye). Kilit mesajı ayrı — bekleyerek çözülebileceğini kullanıcının bilmesi gerekiyor ve zaten yalnızca gerçek bir hesap kilitlenebiliyor.
- Pasif hesap kontrolü şifre karşılaştırmasından **sonra** yapılıyor, yanıt süresi normal girişten ayırt edilemesin diye.
- Her hesapta son giriş zamanı ve IP'si tutuluyor.

### Hesap self-servis (`/hesabim`)

- Kullanıcı kendi adını ve telefonunu değiştirebiliyor. **E-posta, rol ve firma yönetici işi** — profil ucu bunları kabul etmiyor, gövdeye yazmak da bir işe yaramıyor.
- **Kendi şifresini değiştirebiliyor** (Adım 10'un açık kalan eksiği). Mevcut şifre zorunlu — sahipsiz açık bir oturum hesabı ele geçirmeye yetmesin diye. Başarılı olunca tüm oturumlar (isteği yapan dahil) sonlanıyor: şifre sızdığı için değiştiriliyorsa hırsızın oturumu da onunla birlikte ölüyor.
- Kendi güvenlik durumunu görüyor: son giriş, son giriş IP'si, şifre son değişim tarihi.
- Kendi denetim kayıtlarını görüyor. Kapsam oturumdan geliyor — `actorId` parametresi vermek başkasının geçmişini açmıyor.

### Denetim kaydı (`/admin/audit`)

- Salt-ekleme. Uygulamada bu tabloyu güncelleyen ya da silen tek bir kod yolu yok; uçta yalnızca `GET` var (POST/PATCH/DELETE → 405).
- Kaydedilenler: giriş / başarısız giriş / kilit, şifre değişimi ve sıfırlama, profil güncelleme, kullanıcı oluşturma-güncelleme-silme, rol değişimi, aktif/pasif, firma oluşturma-güncelleme-silme, geçersiz oturum reddi, yetkisiz erişim denemesi.
- Her satırda kim (e-posta + rol), ne, hangi kayıt, açıklama, IP ve tarayıcı var. **Kullanıcı silinse bile satır okunabilir kalıyor** — e-posta denormalize saklanıyor, ilişki `SetNull`.
- Kayıt yazımı asıl işlemi bozmuyor: log insert'i patlarsa yutuluyor ve stderr'e düşüyor. Bir satır kaybetmek kötü, tamamlanmış bir şifre değişimini geri almak daha kötü.
- IP `x-forwarded-for`'dan okunuyor — **yalnızca kayıt için**; istemci uydurabildiği için hiçbir yetki kararında kullanılmıyor.
- Görüntüleyici süper admine özel: olay türü, serbest metin, tarih aralığı ve "sadece güvenlik olayları" filtresi + imleç tabanlı sayfalama.

## 12. Promosyon Motoru (Adım 12)

Kampanya **kod değil veri**: her kampanya bir koşul listesi (hepsi sağlanmalı) ve bir
aksiyon listesidir (indirimi üretir). Her ikisi de `{ type, params }` JSON'u olarak
saklanır; yeni bir kampanya türü için kod yazılmaz, ekrandan kural seçilir.

### Kural kayıt defteri — güvenlik sınırı

- `promotion-registry.ts` tanımlı olmayan bir kuralı **yok sayar**: tür bilinmiyorsa kampanya kaydedilmez, çalışma anında da atlanır.
- Her kuralın parametreleri kendi Zod şemasından geçer. İstemciden gelen hiçbir şey kod, Prisma yolu ya da ham SQL olarak yorumlanmaz — rapor tasarımcısındaki veri kümesi kayıt defteriyle aynı desen.
- Doğrulama **hem yazarken hem her çalıştırmada** yapılır: veritabanında elle düzenlenmiş bir satır kural uyduramaz. Derlenemeyen kampanya sipariş akışını bozmaz, atlanır ve loglanır.

### Koşullar

`MIN_ORDER_SUBTOTAL` (sepet net tutarı) · `MIN_ITEM_QUANTITY` (kategori/ürün filtresiyle adet) ·
`CUSTOMER_GROUP_IN` · `COMPANY_IN` · `PAYMENT_METHOD_IS` · `FIRST_ORDER` (firmanın ilk siparişi).

### Aksiyonlar

`PERCENT_OFF` (eşleşen satırlara yüzde) · `FIXED_OFF_UNIT` (adet başına tutar) ·
`FIXED_OFF_ORDER` (sabit tutarı satırlara net oranında dağıtır).

### Uygulama sırası ve para matematiği

- Kampanyalar **öncelik** sırasıyla (küçük önce) çalışır; her kampanya bir öncekinin bıraktığı net tutarı görür, yani üst üste binen kampanyalar bileşik davranır.
- `stopFurther` işaretli kampanya uygulandığında sonrakiler çalışmaz — "tekil kampanya" böyle ifade edilir.
- Hiçbir satır sıfırın altına inmez; indirimi olmayan kampanya "uygulandı" sayılmaz.
- Sabit tutar dağıtımında yuvarlama artığı en büyük satıra verilir — toplam kuruşu kuruşuna tutar.
- **KDV kampanya sonrası net üzerinden** hesaplanır. `grandTotal = ara toplam − iskonto − kampanya + KDV`.
- Kampanya indirimi grup fiyatı ve firma iskontosunun **üzerine** uygulanır, onların yerine geçmez.

### Kupon, tarih ve kota

- Kodsuz kampanya otomatiktir; kodlu kampanya yalnızca müşteri kuponu yazınca değerlendirilir (kod büyük harfe normalize edilir, karşılaştırma harf duyarsız).
- `startsAt` / `endsAt` penceresi; `usageLimit` (toplam) ve `perCompanyLimit` (firma başına) kotaları.
- Kota `PromotionRedemption` satırlarından sayılır ve **iptal/red edilen siparişler sayılmaz** — iptal kotayı geri verir, ama satır silinmediği için siparişin hangi kampanyadan ne aldığı kaydı kalır.
- Kupon yazıldığı halde uygulanamıyorsa hata döner ve iki durumu ayırır: kod geçersiz/süresi dolmuş, ya da sepet koşulu sağlamıyor.

### Sunucu tarafı sepet fiyatlaması

- `POST /api/orders/quote` sepeti sipariş vermeden fiyatlar: satır bazında indirim, uygulanan kampanyalar, KDV, genel toplam.
- Sipariş oluşturma **aynı hesabı** (`buildQuote`) transaction içinde yeniden çalıştırır — önizlemeden sonra fiyat, stok veya kota değişmiş olabilir; istemcinin gönderdiği tutara asla güvenilmez.
- Sepet paneli artık toplamı kendi hesaplamıyor; teklif ucundan geliyor. Teklif hata verirse (MOQ, stok, geçersiz kupon) sipariş butonu kapanır — önizlemede gizlenip checkout'ta patlayan bir hata kalmaz.
- Sipariş kalemine `promotionDiscount`, siparişe `promotionTotal` + `couponCode` yazılır; sipariş detayında hem satır kırılımı hem kampanya adları görünür.

### Yönetim (`/admin/promotions`)

- Kampanya listesi: kod, aktiflik, öncelik, tekillik, tarih penceresi, kotalar, kaç siparişte kullanıldığı ve toplam ne kadar indirim verdiği.
- Kampanya formu koşul/aksiyon kataloğunu `GET /api/admin/promotions/rules` ucundan alır — sunucuya kural eklendiğinde ekran kendiliğinden öğrenir.
- Kategori/ürün/grup/firma parametreleri çoklu seçim listesinden seçilir, elle id yazılmaz.
- Siparişte kullanılmış kampanya **silinemez** (pasife alınır) — siparişler neden ucuzladığının kaydını kaybetmesin diye.

## 13. Kalite Altyapısı (Adım 13)

- **ESLint** her pakette çalışıyor (`pnpm lint`, 6 paket, sıfır uyarı toleransı). Ortak yapılandırma `@repo/eslint-config`: `base` (TS), `next` (web), `react-native` (mobil).
  - Bilerek **tip-farkındalıklı değil** — tip hataları zaten `pnpm typecheck`'te yakalanıyor, tip-farkındalıklı lint ise üretilmiş Prisma client'ına bağımlı olurdu. Geriye tsc'nin söylemediği sınıf kalıyor: ölü kod, kaçak `any`, konsol gürültüsü.
  - Mobilde `eslint-config-expo` kullanılmıyor: o preset @typescript-eslint v8'de kaldırılmış kurallara atıf yapıyor, workspace ise v8 kullanıyor.
- **Vitest** iki ayrı takım hâlinde (`pnpm test`) — bugün **174 test / 13 dosya**:
  - **Birim (83 test)** — saf domain matematiği, veritabanı yok: fiyat kademesi seçimi ve sınır değerleri, iskonto önceliği, sıfır tabanı, kuruş yuvarlama; kampanya motorunda öncelik sırası, bileşik uygulama, `stopFurther`, oransal dağıtım artığı, koşul modu (VE/VEYA), hediye adedi ve nakliye indiriminin tükenmesi; ödeme yönteminin cari borç doğurup doğurmadığı, firma kısıtlamasının satıcıyı da bağlaması, alıcının vade uyduramaması, peşin yönteme vade konamaması; görsel imza tanıma ve yol kaçışı denemeleri; rapor kayıt defterinin kendi tutarlılığı (her alanın join'i bildirilmiş mi, takma adlar çakışıyor mu, join'ler ebeveyninden sonra mı geliyor).
  - **Entegrasyon (91 test)** — gerçek Prisma + gerçek Postgres. Kendi fixture'ını kurar (grup, firma, ürün, fiyat kademeleri, kampanyalar, belge serileri), sadece kendi kayıtlarına dokunur; seed verisi olan bir veritabanında da güvenle çalışır. `DATABASE_URL` yoksa **atlanır**, veritabanı olmayan makinede birim takımı yine geçer.
  - Kapsam: teklif ↔ sipariş tutarlılığı, KDV tabanı, kupon kotası, onay akışı, kredi limiti tutması, iptalde stok + cari geri alma, geçersiz durum geçişi, yetkisiz sevkiyat denemesi, kampanyanın pasife alınması ve süresinin dolması; kısmi sevkiyat/faturalama ve faturaların kuruşu kuruşuna siparişe eşitlenmesi, belge numarası yarışı; sepetin okurken fiyatlanması ve pasif ürünü düşürmesi; şifre sıfırlama biletinin tek kullanımlığı ve hesap ifşa etmemesi; hediye + nakliye indiriminin genel toplamı bozmaması; gruplanmış raporda kapsam zorlaması ve saat dilimi kovaları; adres bazlı giriş sınırı, denetim saklaması ve önbellek tahliyesi; tahsilatın defter ile önbelleği birlikte hareket ettirmesi, iptalin ters kayıtla yazılması ve iki kez yapılamaması, başka firmanın tahsilatına erişilememesi, açık ziyaret varken ikinci ziyaretin reddi.
- **GitHub Actions CI** (`.github/workflows/ci.yml`): Postgres servis konteyneri, `db:deploy`, ardından typecheck → lint → test → build. Aynı ref'e gelen yeni push eskisini iptal ediyor.

## 14. Belgeler & Sevkiyat (Adım 14)

### Numaralandırma — ERP ile yan yana çalışacak şekilde

- `DocumentSeries` bir satır: tür (irsaliye/fatura), ön ek, basamak genişliği, son verilen numara, varsayılan mı, ERP'ye mi ait.
- Numara, belgeyi oluşturan **transaction içinde tek bir `UPDATE ... RETURNING`** ile alınıyor. Postgres satır kilidi tuttuğu için aynı anda iki sevkiyat aynı numarayı alamıyor — sıraya giriyorlar.
- **İptal edilen belge numarasını geri vermiyor.** Numarayı yeniden dağıtmak seriyi yalancı yapar.
- **`externalOnly`:** numarayı ERP (VegaWin A5 / VegaDB gibi) veriyorsa sistem numara üretmiyor, belge oluşturulurken numaranın girilmesini şart koşuyor (`EXTERNAL_NUMBER_REQUIRED`). Dışarıdan numara verildiğinde kendi sayacımız ilerlemiyor — kendi serimizde boşluk açmamak için.
- `Company.externalCode` ve `ProductVariant.externalCode`: ERP eşlemesi için ayrılmış alanlar (uygulama henüz kullanmıyor, senkron gelince join anahtarı olacak).

### Kısmi sevkiyat (irsaliye)

- `Shipment` + `ShipmentItem`; `OrderItem.quantityShipped` ile satır bazında kalan takip ediliyor.
- Sipariş durumu **elle değil, sevkiyattan türetiliyor**: bir şey çıktıysa `PROCESSING`, hepsi çıktıysa `SHIPPED`. İrsaliye iptal edilince durum aynı yoldan geri yürüyor.
- Satırın kalanından fazlası sevk edilemiyor (`OVER_SHIPMENT`).
- **İrsaliye kesilmiş sipariş iptal edilemiyor** — çıkmış mal kaydı silinerek stoğa dönmez; önce irsaliyenin iptal edilmesi gerekiyor (bu da faturalanmışsa reddediliyor).
- İrsaliye çıktısı fiyat içermiyor: irsaliye malı taşır, parayı fatura taşır.

### Kısmi faturalama

- Fatura **miktar faturalar, sipariş değil**: seçilen irsaliyeler faturalanabilir ya da siparişin faturalanmamış tüm kalanı.
- **Para yeniden hesaplanmıyor.** Fiyat, iskonto ve kampanya payı sipariş satırında donmuştu; fatura bunların miktara göre **payını** alıyor. Satırı kapatan fatura yuvarlamadan artanı da alıyor — böylece bir siparişin faturaları toplandığında kuruşu kuruşuna siparişe eşit oluyor (test bunu doğruluyor).
- Nakliye bedeli siparişin **ilk** faturasında bir kez tahsil ediliyor.
- Fatura iptali: durum `CANCELLED`, miktarlar yeniden faturalanabilir hale geliyor, bağlı irsaliyeler serbest kalıyor; numara yakılıyor.

### Vade ve yaşlandırma

- Vade sırası: **faturanın vadesi** → yoksa `Order.paymentTermDays` (siparişe özel vade) → yoksa `Company.paymentTermDays`.
- Cari borç hâlâ sipariş onaylandığında yazılıyor (kredi limitini ölçen şey o), ama **vade tarihi boş bırakılıyor**. Fatura kesildiğinde borcun `dueDate` alanı damgalanıyor; birden çok fatura varsa en geç vade kazanıyor.
- Yaşlandırma artık `dueDate` üzerinden kovalıyor; vadesi damgalanmamış borçlar eskisi gibi `sipariş tarihi + firma vadesi` ile yaşlanıyor.

### Nakliye bedeli

- `Order.shippingFee` + `shippingVatRate`. **Yalnızca satıcı tarafı** (süper admin, plasiyer) girebiliyor — alıcı kendi navlununu fiyatlayamaz, alan yok sayılıyor.
- Toplam: `genel toplam = ara toplam − iskonto − kampanya + nakliye + KDV`; nakliye KDV'si de `taxTotal` içinde.

### Ekranlar

- Sipariş detayında **İrsaliyeler / Faturalar** paneli: belgeler herkese görünür, form yalnızca süper adminde. Sevk formu kalan miktarlarla dolu geliyor.
- `/documents/shipments/[id]` ve `/documents/invoices/[id]` — yazdırılabilir belge (beyaz zemin, koyu tema yok, araç çubuğu baskıda gizli). Erişim belgenin firması üzerinden yetkilendiriliyor.
- `/admin/documents` — seri yönetimi. Sayaç ileri alınabiliyor (ERP serisine devam etmek için), **geri alınamıyor**.

## 15. E-posta & Bildirimler (Adım 15)

### Taşıyıcı — ortama göre seçilir, bayrakla değil

- `SMTP_HOST` doluysa **SMTP**, boşsa **konsol taşıyıcısı**: mesaj gönderilmez, sunucu günlüğüne tam metniyle basılır.
- Konsol taşıyıcısı bir taslak değil, geliştirmenin normal hâli — mail hesabı olmadan "şifremi unuttum" akışı baştan sona yürütülebiliyor, sıfırlama bağlantısı terminalde çıkıyor.
- Gönderim **çağıranın hatasına dönüşmez**: mail sunucusu düşükse sipariş yine oluşur. Sonuç denetim kaydına `NOTIFICATION_SENT` / `NOTIFICATION_FAILED` olarak yazılır.
- Şablonlar tek dosyada (`mail-templates.ts`) ve her biri **hem düz metin hem HTML** üretir; düz metin sonradan eklenmiş bir yedek değil, HTML'i engelleyen istemcinin gördüğü şey.

### "Şifremi unuttum" (`/sifremi-unuttum`)

- İstek ucu **hiçbir zaman** e-postanın kayıtlı olup olmadığını söylemez: bilinmeyen adres, pasif hesap ve gerçek hesap aynı yanıtı alır. Aksi hâlde bu uç müşteri listesi çıkarmanın yolu olurdu.
- Veritabanında **yalnızca token'ın SHA-256'sı** durur; düz metin sadece e-postada.
- Bağlantı **60 dakika** geçerli, **tek kullanımlık**, ve yeni bağlantı istendiğinde eskiler anında geçersizleşir.
- Hesap başına **15 dakikada 3 istek**; sınıra takılan istek sessizce gönderimsiz kalır, yanıt yine aynıdır.
- Sıfırlama başarılı olduğunda `tokenVersion` artar (tüm oturumlar kapanır) ve **giriş kilidi temizlenir** — posta kutusunu kanıtlayan kişi hesabın sahibidir.
- `purgePasswordResetTokens()` süresi geçmiş/harcanmış kayıtları siler; henüz bir zamanlayıcıya bağlı değil.

### Bildirimler

| Olay | Kime | Not |
|------|------|-----|
| Sipariş oluştu | firma yöneticileri + siparişi giren + (onay beklemiyorsa) firmanın plasiyeri | Onay bekleyen siparişte metin "onayınızı bekliyor" olur |
| Durum değişti | firma yöneticileri + siparişi giren | Yalnızca `CONFIRMED`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `REJECTED`; ara durumlar sessiz |
| Fatura kesildi | firma yöneticileri + siparişi giren | Vade tarihi ve fatura no ile |

- Alıcılar **veriden çözülür**, parametre olarak geçilmez — yanlış kutuya sipariş sızdırmak çağıranın elinde değil.
- Bildirim **işlem (transaction) dışında**, iş tamamlandıktan sonra gönderilir: SMTP gidiş-dönüşü boyunca veritabanı bağlantısı tutulmaz, geri alınabilecek bir durum duyurulmaz.

## 16. Sepet & Görseller (Adım 16)

### Sepet artık sunucuda

- `Cart` satırı **(firma, sahip)** çifti başına tek: telefonda kurulan sepet masaüstünde de açık, sekme kapanınca kaybolmuyor. Plasiyer üç müşteri için üç sepet taşıyabiliyor.
- Satır yalnızca **niyeti** tutuyor: varyant + adet. Fiyat, kampanya ve KDV **okurken** çözülüyor — geçen haftanın fiyatını hatırlayan bir sepet, fiyat listesi değiştiği anda yalan söylerdi.
- **MOQ / koli katı / stok sepette dayatılmıyor.** Sepet bir taslak; hâlâ düzenlediğiniz adet için azarlanmak can sıkıcı olur. Kurallar teklif ve sipariş anında zaten uygulanıyor; sepet okuması arayüzün kullanıcıyı doğru adede yönlendirmesi için gereken sayıları (`moqUnits`, `unitsPerCase`, `stock`) veriyor.
- Kataloğdan çıkmış (pasif) ürünün satırı yanıttan **ve satırdan** düşüyor — ödeme adımında elinden bir şey gelmeyen alıcıya hata göstermek yerine.
- Firmanın fiyatı olmayan satır **silinmiyor**, `netUnitPrice: null` ile gösteriliyor: alıcı neden sipariş veremediğini görüyor.
- Sipariş oluşunca sepet **sunucuda** boşaltılıyor (tarayıcıda değil) — ikinci sekmeden aynı siparişin tekrar verilmesini engelliyor, mobil için de geçerli.
- İstemci tarafı iyimser yazıyor: buton anında tepki veriyor, sunucunun döndürdüğü sepet son sözü söylüyor.

### Görsel yükleme

- `POST /api/admin/uploads` (multipart, yalnızca süper admin) → `GET /api/media/<klasör>/<dosya>`.
- Dosyalar `public/` içine değil, `UPLOAD_DIR` (varsayılan `./uploads`) altına yazılıyor ve bir uç üzerinden servis ediliyor: `public/` derleme zamanı bir dizin, çalışırken içine yazmak paketlenmiş/konteynerli kurulumda çalışmaz.
- **Türü içerik belirliyor, ad değil**: yalnızca JPEG/PNG/WebP/AVIF/GIF imzası taşıyan dosya kabul ediliyor; `photo.png` adlı bir PHP dosyası reddediliyor.
- İstemcinin dosya adı diske **hiç yazılmıyor** — ad rastgele üretiliyor: geçilecek yol, üzerine yazılacak dosya ve tahmin edilecek URL yok.
- Okuma yolu çözümlendikten sonra kökün içinde kalıp kalmadığı kontrol ediliyor; `../` ile dışarı çıkılamıyor.
- Sınır 5 MB. Yükleme denetim kaydına `MEDIA_UPLOADED` olarak düşüyor.
- `/api/media` **kimlik doğrulaması istemiyor**: bunlar katalog fotoğrafı, belge değil; mobilde `<Image>` bearer token ekleyemez. Adlar rastgele olduğu için URL tahmin edilemiyor.

## 17. Kampanya Motoru v2 (Adım 17)

### Koşullarda VEYA

- `Promotion.conditionMode`: **ALL** (VE, varsayılan) ya da **ANY** (VEYA). Önceki kampanyalar VE ile çalıştığı için varsayılan onları olduğu gibi korur.
- Koşulsuz kampanya her iki modda da çalışır — "koşul yok" demek "her sepette geçerli" demek.

### Nakliye indirimi

- Yeni aksiyonlar: **`FREE_SHIPPING`** (nakliyeyi siler) ve **`SHIPPING_PERCENT_OFF`** (yüzde düşer).
- Motor nakliyeyi de sırayla tüketiyor: ilk kampanya %60 aldıysa ikincisi yalnızca kalan %40'ı alabiliyor, toplam hiçbir zaman navlunu aşmıyor.
- **Para modeli (önemli):** `Order.shippingFee` **indirim sonrası, tahsil edilen** tutardır; indirim ayrıca `Order.shippingDiscount` sütununda durur ve **genel toplam hesabına girmez** — girseydi nakliye iki kez düşerdi. `promotionTotal` yalnızca **mal** indirimini taşır, çünkü faturalama bu tutarı satırlara paylaştırıyor; içinde saklanan bir navlun indirimi tahsisi bozardı. Alıcıya gösterilen "Kampanya: X − 150" satırı ise kampanyanın verdiği **her şeyi** içerir.
- KDV, tahsil edilen navluna göre hesaplanır.

### Hediye ürün (X alana Y bedava)

- Aksiyon `GIFT_ITEM`: hediye varyantı, adet, isteğe bağlı **"her N adette bir"** (`perMatch`) ve **üst sınır** (`maxQuantity`). Hedef ürün/kategori verilirse N sayımı yalnızca o satırlardan yapılır.
- Motor hediyeyi **fiyatlamaz** — katalogdan haberi yok, sadece "şu varyanttan şu kadar" der. Fiyatlamayı teklif yapar: hediye, **kendi liste değeriyle** bir satır olarak eklenir ve **eşit tutarda kampanya indirimiyle** sıfırlanır. Böylece fatura hediyeyi bedelsiz gösterirken değerini de gösterir; "hiç değeri yokmuş" gibi davranmaz.
- Hediye **stoktan düşer**, ücretli satırların ayırdığı stoğu yemez.
- Verilemeyen hediye siparişi düşürmez, **atlanır**: stok bittiyse kalan kadarı verilir, firmaya uygulanabilir fiyatı yoksa hiç verilmez. Aylar önce yanlış kurulmuş bir kampanya bugünkü siparişi bloklamamalı.
- `OrderItem.isGift` ile işaretlenir; sipariş detayında "hediye" rozeti çıkar.

### Mobilde kupon

- Mobil sepet artık **sunucudan fiyat alıyor** (`POST /api/orders/quote`): cihaz kendi topladığı için kampanyaları kaçırmıyordu. Cihaz üzerindeki hesap yalnızca istek uçarken gösterilen yer tutucu.
- Kupon alanı eklendi; geçersiz kod ödeme anında değil, **teklif çağrısında** tipli hata olarak dönüyor.

## 18. Rapor Motoru v2 (Adım 18)

### Gruplama artık veritabanında

- Özetli raporlar `GROUP BY` ile çalışıyor (`report-sql.ts`). Veritabanı grup başına tek satır döndürdüğü için **20.000 satırlık tarama sınırı kalktı**; bugün sınırlanan şey satır değil **grup** sayısı (5.000).
- Kayıt defteri artık her veri kümesi için **tablo ve join haritası** da taşıyor (`DatasetSql`). SQL'e giden hiçbir tanımlayıcı rapor tanımından gelmiyor: alan adı önce kayıt defterinde çözülüyor, sonra bizim yazdığımız `path` bizim yazdığımız takma adlarla sütuna dönüşüyor. Değerler (filtre argümanı, kapsam kimliği, limit) **her zaman bağlı parametre**.
- Çıktı sütunları `c0`, `c1`… olarak adlandırılıyor: sütun anahtarı kullanıcı girdisinden gelebiliyor ve SQL tanımlayıcısı olmaya hakkı yok. Eşleme konuma göre geri kuruluyor.
- **Kapsam tek yerden okunuyor:** `scope()` hâlâ Prisma filtresi olarak yazılıyor, SQL tarafına çevriliyor. İki ayrı kapsam tanımı, "grupla" düğmesine basıldığı gün açılacak bir delik olurdu — entegrasyon testi plasiyerin ve firma yöneticisinin gruplanmış raporda da yalnızca kendi satırlarını gördüğünü doğruluyor.
- **Tarih kovaları raporlama saat diliminde** kesiliyor (`REPORT_TIMEZONE`, varsayılan `Europe/Istanbul`). Postgres UTC saklar; dilim verilmezse 01:30'daki sipariş sessizce dünkü güne düşerdi.
- Sayısal sonuçlar sürücüden `bigint`/`numeric` olarak geldiği için sütunun kendi tipine göre sayıya çevriliyor; para toplamları iki haneye yuvarlanıyor.

### İlişkili tablo alanları

- Alanlar artık **kaynak tabloya göre** gruplu sunuluyor (`source`): "Siparişler | Firma | Kullanıcı | Sevk adresi". Kullanıcı "Firma → Müşteri grubu"nu seçiyor, JOIN yazmıyor.
- Sipariş kalemlerine katalog tarafı (marka, kategori, katalog SKU/ad), siparişlere firma tarafı (vergi no, kredi limiti, bakiye, vade, plasiyer e-postası), cari deftere sipariş durumu eklendi.
- Kayıt defteri tutarlılığı **teste bağlandı**: bir alanın yolu bildirilmemiş bir ilişkiden geçiyorsa, join takma adları çakışıyorsa ya da join'ler ebeveyninden önce geliyorsa test kırmızıya döner — yoksa hata ilk gruplama denemesinde üretimde çıkardı.

## 19. Güvenlik Sertleştirme (Adım 19)

### Adres bazlı giriş hız sınırı

- Hesap kilidi **e-posta başına** sayar; bu yüzden tek bir yaygın şifreyi yüz farklı adrese denemek (password spraying) hiçbir hesabı kilitlemez — her hesap tek başarısızlık görür. Artık **kaynak adres başına** da sayılıyor: 15 dakikada 20 başarısızlık → adres bloklu.
- Sayaç **denetim kaydının kendisi**. İkinci bir tablo, aynı olaylar hakkında ikinci bir gerçek kaynağı olurdu ve denetçinin okuduğundan sapabilirdi; `AuditLog` zaten her başarısız girişi adresiyle yazıyor, sorgu için indeks eklendi.
- Blok, pencere içindeki eski başarısızlıklar yaşlandıkça **kendiliğinden** kalkar; ayrıca temizlenmesi gereken bir blok kaydı yok.
- Kontrol şifre karşılaştırmasından **önce** yapılır. Adresi olmayan istek sınırlanmaz — "bilinmeyen" için bir kimlik uydurmak, o vekilin arkasındaki herkesi aynı kovaya koymak olurdu.

### Denetim kaydı: saklama ve dışa aktarma

- `/admin/audit` ekranında: toplam kayıt, en eski/en yeni tarih, seçilen saklama süresinden eski kayıt sayısı — **silmeyi önermeden önce ne gideceğini gösterir**.
- Silme süper admine özel, **açık bir kesim tarihi** ister (kimsenin izlemediği bir zamanlayıcı değil) ve güvenlik olayları isteğe bağlı olarak muaf tutulabilir. Silmenin kendisi `AUDIT_PURGED` olarak kayda geçer — aksi hâlde kayıtta hiçbir şeyin açıklamadığı bir boşluk kalırdı.
- CSV dışa aktarma **akış hâlinde**: dışa aktarma tam da tablonun en büyük olduğu andır, bir yıllık kaydı tek bir metne toplamak sunucuyu düşürmenin yoludur. Çıktı UTF-8 BOM ile başlar (Excel aksi hâlde Türkçe karakterleri sistem kod sayfasıyla okur) ve `=`, `+`, `-`, `@` ile başlayan hücreler tırnaklanır — bir denetim özeti kimsenin elektronik tablosunda formül olarak çalışmamalı.

### Birleşik hareket akışı (`/admin/activity`)

- Üç geçmiş tek sütunda: `OrderStatusHistory`, `Transaction`, `AuditLog`. **Yalnızca okuma** — hiçbir şey yazmaz, hiçbir şeyin sahibi değildir; üç kaynak da kendi olaylarının kaydı olmaya devam eder. Dördüncü bir tablo, diğer üçüyle çelişmekte özgür olurdu.
- Her kaynaktan aynı limit çekilip birleştirilir: birinden az çekmek, yoğun bir kaynağın diğerlerini sayfadan itmesine yol açardı.
- **Denetim kaydı yalnızca süper adminde görünür.** Firma alanı taşımadığı için, herkese gösterilseydi bir müşteriye başkalarının giriş kayıtları düşerdi — bu birleştirmenin kazara açabileceği delik tam olarak budur.

### Principal önbelleği

- İstek başına hesap sorgusunun önünde **5 saniyelik**, süreç içi bir önbellek.
- Üç kural bunu güvenli kılıyor: (1) önbellek asla "yetkili" demez, yalnızca satırı saklar — karar hâlâ her istekte `checkPrincipal`'da verilir; (2) yetkiyi değiştiren **her** yazma (rol, firma, aktiflik, şifre, silme, oturum iptali) girdiyi **yazmadan sonra** düşürür, böylece iptal bir sonraki istekte hissedilir; (3) ıskalamak güvenli yön — boş önbellek bir sorguya, bayat önbellek doğruluğa mal olur.
- Sınırı yukarıda yazılı: çok süreçli kurulumda iptal diğer süreçlere ulaşmaz.

## 20. Arayüz Tasarım Katmanı (Adım 20 — Faz 1)

Ekranlar tek tek yamanmadı; önce ortak bir katman kuruldu, ekranlar onun
üstüne oturuyor. Amaç: renk/boşluk/buton kararının **tek yerde** verilmesi.

### Token'lar

- **`brand` renk skalası** (`tailwind.config.ts`) — koddaki dağınık `indigo-600` kullanımını resmileştirdi; yeni bir renk ailesi eklemedi, var olan örtük markayı adlandırdı.
- **Tipografi ikilisi:** gövde Inter, başlık Plus Jakarta Sans (`next/font` ile, CSS değişkeni olarak).
- **Gölge:** `shadow-card` / `shadow-card-hover` — düz gölge yerine katmanlı derinlik.
- `globals.css`: marka rengiyle tutarlı odak halkası (`focus-visible`), tonlu kaydırma çubuğu ve seçim rengi.

### Koyu tema

- **`darkMode: "class"`** — sistem tercihi **değil**, kullanıcı üst bardaki anahtarla seçer.
- `lib/theme.ts` boyamadan önce çalışan bir init script veriyor: tema `localStorage`'dan okunup `<html>`'e yazılıyor, böylece sayfa yanlış temada açılıp geri dönmüyor (FOUC yok).

### Paylaşılan bileşenler

| Dosya | İçerik |
|-------|--------|
| `components/form.tsx` | `Button` (primary/secondary/danger/success/ghost + `loading`), `TextInput`, `Select`, `TextArea`, `Label` (artık gerçek `<label>`), `Panel`, `ErrorLine` |
| `components/ui.tsx` | `Card`, `Badge` (ton bazlı), `PageHeader`, `LoadingState`, `EmptyState` |
| `components/app-shell.tsx` | `AppHeader` — marka işareti, ikonlu gezinme, aktif sekme vurgusu, tema anahtarı, çıkış |
| `components/portal-nav.tsx` | Portalın rol bazlı link listesi (`AppHeader`'ı sarar) |

- `form.tsx` zaten 20 yönetim dosyası tarafından içe aktarılıyordu; oradaki değişiklik o ekranlara kendiliğinden yansıdı.
- **Üç rolün kabuğu tek bileşen oldu:** admin, portal ve plasiyer panelleri artık aynı `AppHeader`'ı kullanıyor — önceden her biri kendi başlığını elle çiziyordu.
- Bu birleştirme bir **boşluğu da kapattı:** portalın alt sayfaları farklı ve eksik link setleri taşıyordu; `/portal/orders`'tan `/portal/approvals`'a geçilemiyordu. Artık her sayfadan her sayfaya gidiliyor.

### Bu dille yeniden çizilen ekranlar

`/login` · `/403` · `/` · `/hesabim` · `/admin` (pano + cari tablosu) · portalın beş sayfası · `/rep` · sipariş tahtası (`orders-board`, üç ekranda birden kullanılıyor).

`documents/*` bilinçli olarak **dokunulmadı** — yazdırma şablonu kendi kuralına
tabi (beyaz kâğıt, koyu tema yok, araç çubuğu baskıda kaybolur).

Kalanı Faz 2'de — bkz. Bilinen Eksikler.

## 21. Vitrin — Endüstriyel Kimlik (Adım 21 — Faz 2)

Müşteriye bakan katalog artık bir **vitrin**: e-ticaretin gezinme alışkanlıkları
(kategori, arama, sıralama, ürün detayı) var, ama görünüm bilerek pazaryerine
benzemiyor. Seçilen yön **endüstriyel/teknik**: ölçekli kâğıt zemini, keskin
köşeler, ölçen her sayının monospace dizilmesi. Toptan işinde ekranda SKU, stok
ve koli sayısı okunur — kimlik oradan çıkıyor.

### Kimliğin kuralları

- **`tech-num`** — SKU, stok, koli, adet ve fiyat. Monospace + sekmeli rakam: alt alta gelen fiyatların basamakları hizalanır.
- **`tech-label`** — bölüm etiketleri: küçük, harf aralıklı, büyük harf. Her başlığın üstündeki "levha numarası".
- **`tech-paper`** — 32px'lik çok soluk ızgara; kartların arkasında ölçekli kâğıt hissi.
- Yalnızca **müşteri yüzeyinde** kullanılır. Yönetim ekranları Faz 1'in nötr dilinde kalır — orada veri girişi var, vitrin karakteri değil.

### Vitrin düzeni (`/portal`)

- Sol: **kategori kenar çubuğu** (ağaç, girintili, seçili olan marka renginde şeritli).
- Üst: **arama** — artık yalnızca ürün adı değil, **marka, SKU ve barkod** da aranıyor (`listCatalog` içinde `OR`). Müşteri elindeki kutunun barkodunu yazıp bulabiliyor.
- **Sıralama** (ad / fiyat ↑↓ / stok) ve **"yalnızca stokta"** filtresi istemcide çalışıyor: katalog tek istekte geldiği için her sıralamada sunucuya gitmek gereksiz gecikme olurdu.
- Sağ: sepet paneli, sayfa kaydıkça yapışkan.

### Ürün kartı ve detay sayfası

- Kart: görsel, marka/KDV künyesi, **"…'den başlayan"** fiyat, ilk 3 varyant satırı (SKU · STK · KOL) ve her satırda tek tıkla sepete ekleme. 3'ten fazlaysa detaya bağlanıyor.
- **`/portal/urun/[id]` — yeni sayfa.** Önceden ürün detayı yoktu; varyantlar yalnızca kart içinde görünüyordu. Sayfada: görsel galerisi, künye ızgarası (varyant/stok/KDV) ve **varyant tablosu**. Tablo perakende sitelerindeki gibi gizlenmiyor — toptan siparişte asıl iş orada dönüyor, her satırın kendi adet kutusu ve satır toplamı var.
- Fiyat her iki yüzeyde de **sunucuda, firmaya göre** çözülüyor; istemci ham fiyat listesini hiç görmüyor.
- `getCatalogProduct` ile `listCatalog` aynı `CATALOG_SELECT` ve aynı eşleme fonksiyonunu kullanıyor — liste ile detayın aynı varyant için farklı alan göstermesi mümkün değil.

### Vitrin duyuruları (`Announcement`)

Kampanya motorundan **bilerek ayrı** bir model: buradaki hiçbir kayıt bir tutarı
değiştirmez. Fiyatı değiştiren tek yer promosyon motorudur; bu katman yalnızca
"ne yazsın, nerede dursun, kime görünsün" sorusunu cevaplar. İkisi tek modelde
olsaydı bir metin düzeltmesi fiyat mantığına dokunan bir yazma hâline gelirdi.

| Konum | Görünüm |
|-------|---------|
| `TICKER` | Üstte kayan şerit; birden fazlası arka arkaya akar, fare üzerine gelince durur |
| `BANNER` | Katalog üstünde duran kart, çarpıyla kapatılır |
| `MODAL` | Girişte bir kez açılan pencere; Escape ve arka plan tıklaması da kapatır |

- **Kapatma tarayıcıda hatırlanır**, sunucuya yazılmaz. Bu bir tercih değil "gördüm" işareti: kullanıcı başka bir cihazda duyuruyu tekrar görsün — kaçırılmış bir kampanya duyurusu, iki kez gösterilmiş olandan pahalıdır.
- **Kapsam veritabanında uygulanır:** "yalnızca bayilere" işaretli duyuru başka gruptaki firmaya hiç gönderilmez, istemcide gizlenmez.
- Zaman penceresi (`startsAt`/`endsAt`), öncelik, ton ve kapatılabilirlik ayarlanabilir.
- Yönetimi: **`/admin/announcements`**.
- `prefers-reduced-motion` açıksa kayan şerit durur.

## 22. Vekaleten Sipariş (Adım 22)

Toptan satışta siparişin çoğu müşterinin kendi elinden değil, **plasiyerin
elinden** girer: saha ziyaretinde ya da telefonla gelen siparişte. Bu akış
API'de baştan beri vardı (`POST /api/orders` plasiyeri kabul ediyordu) ama
web'de onu çağıracak ekran yoktu — yani pratikte firma tarafından kimse
sipariş giremiyordu. Adım 22 o boşluğu kapatır.

### İki tür kullanıcı, tek vitrin

| | Alıcı (firma yön./personel) | Vekil (plasiyer / süper admin) |
|--|--|--|
| Firma | Hesabından gelir | **URL'den seçilir** (`?companyId=`) |
| Seçmeden | Katalog açılır | Firma seçim ekranı çıkar |
| Üst bar | Sade | Firma seçici + uyarı şeridi |
| Gezinme | Linkler sade | Her link seçili firmayı taşır |

- **Seçim URL'de taşınır, tarayıcı hafızasında değil.** Yanlış cariye sipariş girmek pahalı bir hatadır ve gizli bir durumdan beslenmemeli: adres çubuğunda görünür, yenilemede korunur, sekmeler bağımsız kalır ve sunucu her istekte aynı değeri yetkilendirir.
- **`ActingAsBar`** — "X firması adına sipariş giriyorsunuz" + kullanılabilir limit, katalogun üstünde dikkat çeken renkte. Limit doluysa "sipariş onaya düşer" uyarısı; plasiyer bunu siparişi tamamlamadan önce görür, sonra değil.
- Firma seçmeden ürüne gelinirse (eski/paylaşılmış bağlantı) seçim ekranına dönülür — fiyat firmaya göre çözüldüğü için firmasız katalog zaten anlamsız.

### Yetkilendirme

- Tek karar noktası: **`resolveCompanyId`**. Sayfalar `lib/portal-context.ts` üzerinden aynı fonksiyonu çağırır — ekranın kendi kopyası olsaydı API ile zamanla ayrışırdı.
- Plasiyer yalnızca **portföyündeki** firmayı (`Company.salesRepId`), süper admin herkesi seçebilir.
- Sayfalarda yetkisiz firma → **`/403`'e yönlendirme**. (`AuthError` API'de `withAuthErrors` ile 403'e çevriliyor; sayfaların böyle bir sarmalayıcısı olmadığı için yakalanmasaydı kullanıcı erişim engellense bile **500 çökme sayfası** görürdü.)
- Sepet zaten `(companyId, ownerId)` çiftine bağlı: plasiyerin A ve B müşterisi için kurduğu sepetler birbirine karışmaz, sahibi hiçbir zaman parametre değil oturumdan gelir.
- Vekil kullanıcıya "Onaylar" ve "Kullanıcılar" gösterilmez — müşterinin kendi iç işleyişi, plasiyerin işi değil.

### Giriş noktaları

- `/rep` panosundaki portföy tablosunda her satırda **"Sipariş gir"** — katalog o firmanın fiyatlarıyla açılır.
- Üst bardaki firma seçici (arama + bakiye/kullanılabilir limit gösterimi) ile firmalar arasında geçiş.
- Plasiyer üst gezinmesine `Sipariş gir` eklendi.

**Doğrulama:** betikli uçtan uca kontrol 18/18 — plasiyer girişi → firma seçimi →
katalog → sepet → fiyat teklifi → **sipariş oluşturma**, ardından portföy dışı
firma için sayfa/katalog/sipariş uçlarının üçünde de ret. Seed'e bilerek
plasiyere atanmamış ikinci bir firma (`Beta Dağıtım Ltd.`) eklendi: portföy
izolasyonu ancak portföy dışında bir firma varsa sınanabilir.

## 23. Saha İşlemleri Web'de (Adım 23)

Adım 22 sipariş boşluğunu kapattı; aynı desendeki iki boşluk daha duruyordu:
`/api/payments` ve `/api/checkins` uçları baştan beri vardı ama **yalnızca
mobil uygulama çağırıyordu**. Uygulama hiçbir gerçek cihazda çalıştırılmadığı
için pratikte tahsilat ve ziyaret hiç girilemiyordu. Adım 23 ikisini de web'e
taşır — ve taşırken üç modelleme hatasını düzeltir.

### Tahsilat şekli artık ayrı bir soru

`PaymentMethod` (`OPEN_ACCOUNT` / `CREDIT_CARD`) **siparişin nasıl kapanacağını**
söyler; sipariş onayı ve kampanya koşulları bu enum'u okur. Tahsilat ekranı
onu sorduğunda plasiyere "Açık hesap mı, kredi kartı mı?" diye soruluyordu —
sahada toplanan paranın (nakit, havale, çek, senet) karşılığı listede yoktu.

Enum'u genişletmek nakit ve çeki sipariş akışına ve kampanya kurallarına da
sokardı. Bunun yerine ayrı bir alan açıldı:

- **`CollectionMethod`** = `CASH · BANK_TRANSFER · CHEQUE · PROMISSORY_NOTE · CREDIT_CARD · OTHER`
- `Transaction.collectionMethod` yalnızca tahsilat satırlarında dolar; `paymentMethod` sipariş tarafının alanı olarak kalır.
- Mobil tahsilat ekranı da bu listeye geçti (eski "ödeme yöntemi" seçimi kaldırıldı).

### Tahsilat iptali — silme değil, ters kayıt

Yanlış tutar ya da yanlış cari, veritabanına elle girmeden düzeltilemiyordu.
Artık düzeltiliyor, ama **kayıt silinmez**: aynı tutarda ters bir DEBIT satırı
yazılır ve orijinali işaret eder.

- `Transaction.reversalOfId` **tekil (unique)** — aynı tahsilatın iki kez iptali uygulama kodundaki kontrolle değil **veritabanıyla** engelleniyor; yarış koşulu bırakmıyor.
- Gerekçe zorunlu (en az 3 karakter) ve iptal satırının açıklamasına yazılır: ekstreyi okuyan kişi "neden" sorusunun cevabını satırın kendisinde bulur.
- İki satır da ekstrede kalır; nakit bakiyesi eski hâline döner.
- Yetki: `companyId` istekle gelir, `resolveCompanyId` ile yetkilendirilir, sonra servis kaydın gerçekten o firmaya ait olduğunu doğrular. Yanlış firma ve olmayan kayıt **aynı cevabı** verir (404) — yetki id deneyerek yoklanamaz.

### Ziyaret: kaynak damgası + tek açık ziyaret

- **`CheckIn.source` (`MOBILE` / `WEB`)** sunucuda, isteğin taşıdığı kimlik bilgisinden türetilir (`requestChannel()`): bearer token → mobil, çerez → web. İstemci gönderemez. Gerekçe: telefonun kapıda aldığı GPS ölçümü ile masaüstü tarayıcının tahmini konumu aynı kanıt değil; kolon olmadan ofiste yazılmış ziyaretle sahadaki ziyaret aynı raporda ayırt edilemezdi.
- **Bir plasiyerin aynı anda tek açık ziyareti olabilir.** Üst üste binen iki ziyaret gerçekte olmuş bir şey değil, unutulmuş bir çıkıştır — ve üzerinden hesaplanan her süre yanlıştır. Yeni ziyaret açık ziyaret varken reddedilir, hata mesajı açık ziyaretin firmasını söyler, ekran da onu en üstte kapatma butonuyla gösterir.
- `GET /api/checkins` artık listeyle birlikte **açık ziyareti ayrıca** döndürür (listeden aranırsa filtre/sayfalama değişince bozulurdu).
- Konum web'de de best-effort: izin verilmezse ziyaret konumsuz kaydedilir, plasiyer bloklanmaz.

### Ekranlar

| Ekran | İçerik |
|-------|--------|
| `/rep/tahsilat` | Firma seçimi (URL'de) → bakiye/limit kartları → tutar + tahsilat şekli + açıklama → **onay adımı** → kayıt. Altında o firmanın tüm tahsilatları (kimin girdiği dahil) ve satır bazında iptal. |
| `/rep/ziyaret` | Açık ziyaret kartı (canlı süre + kapat), yeni ziyaret formu (not + "Konumu ekle"), geçmiş listesi (Mobil/Web rozeti, süre, haritada) |

- **Onay adımı bilinçli:** tutar yazılıp kaydet denince önce "X firmasına Y ₺ işlenecek, bakiye A → B" büyük puntoyla gösterilir. Bu ekranda en pahalı iki hata fazladan bir sıfır ve çift tıklamadır.
- **Liste ofisin girdiklerini de gösterir** — plasiyer yalnızca kendi kayıtlarını görseydi merkezden işlenmiş bir ödemeyi ikinci kez isterdi. Firma verilmeden çağrılırsa uç "benim kaydettiklerim"e döner; kapsamsız listeleme yok.
- `/rep` portföy tablosundaki her satırda artık **Sipariş · Tahsilat · Ziyaret** üçlüsü var; firma seçimi bağlantıda taşındığı için hedef ekran hangi cariyle çalışıldığını sormaz.
- Plasiyer üst barı tek bileşene (`components/rep-nav.tsx`) alındı ve seçili firmayı her linkte taşıyor — portalda Faz 1'de düzeltilen "her sayfa kendi link listesini çiziyor" hatası burada baştan yapılmadı.
- Firma seçim ekranı (`components/company-picker.tsx`) portaldan çıkarılıp paylaşıldı: katalog, tahsilat ve ziyaret aynı seçiciyi `basePath` ile kullanıyor.

**Doğrulama:** 10 yeni entegrasyon testi (toplam **161**) + betikli uçtan uca
kontrol **25/25**: giriş → sayfalar → tahsilat → bakiye → iptal → ikinci iptal
reddi → ziyaret aç → ikinci ziyaret reddi → kapat. Portföy dışı firma için
sayfa, liste ve iptal uçlarının üçünde de ret.

## 24. Ödeme Yöntemi & Vade (Adım 24)

Sipariş "nasıl kapanacak" sorusunun cevabı. Önceki hâlde iki yöntem vardı
(açık hesap, kredi kartı) ve vade yalnızca firmanın tek bir sayısıydı.

### Beş yöntem, tek karar tablosu

`OPEN_ACCOUNT · CREDIT_CARD · BANK_TRANSFER · CASH · CHEQUE`

Asıl soru şu: hangisi **cari borç doğurur**? Cevap tek yerde —
`paymentMethodMeta()` (`payment-terms.ts`):

| Yöntem | Cari borç doğurur | Neden |
|--------|-------------------|-------|
| Açık hesap | ✅ | Tanımı bu |
| **Çek** | ✅ | İleri tarihli ödeme sözü — çekin tahsil edilip edilmeyeceği tahsilatın sorunu, siparişin değil |
| Nakit · Havale · Kredi kartı | ❌ | Para sipariş anında alınmış; cari hiç duymaz |

Bu tabloyu okuyan üç yer var: **kredi limiti kontrolü** (yalnız vadeli satış
limite sayılır), **cari kaydı** (borç yalnız vadeli satışta yazılır) ve
**kampanya koşulu**. Hiçbiri tek tek yönteme bakmıyor — yeni bir yöntem
eklemek tabloya bir satır eklemek demek.

### Vade artık isimli tanım

`PaymentTerm` — "Peşin", "30 gün", "60 gün". Tanımlar geneldir
(`/admin/payment-terms`), **kime sunulacağı firma sayfasında** seçilir (m-n).

İki kalıcı karar:

- **Sipariş tanıma bağlanmaz, gün sayısını kopyalar.** Gelecek yıl "60 gün"
  tanımını silmek ya da 45'e çekmek, o vadeyle satılmış geçmiş siparişleri
  değiştiremez.
- **Alıcı vade uyduramaz.** İstekte `paymentTermDays: 365` gönderen alıcı
  reddedilir (sessizce yok sayılmaz — yutulsaydı vade verilmiş gibi görünürdü).
  Alıcı yalnızca kendisine sunulan menüden seçer; serbest gün girmek satıcı
  tarafının (plasiyer / süper admin) işidir, çünkü pazarlığı onlar yapar.

Peşin bir yönteme vade konursa **hata verilir**: ödenmiş bir siparişe vade
yazmak, olmayan bir borca son ödeme tarihi koymak olurdu. "Peşin" (0 gün)
tanımı ise nakitle uyumludur — çelişki pozitif vadede.

### Firma bazlı kısıtlama

`Company.allowedPaymentMethods` — bu müşteriye ödemede hangi yöntemler
çıkacak. **Boş dizi = kısıtlama yok** (hepsi sunulur), "hiçbiri" değil:
kısıtlamak bilinçli bir işlem, kimsenin ayar yapmadığı firma çalışmaya devam
eder. Kısıtlama **satıcıyı da bağlar** — plasiyer müşteri adına sipariş
girerken de aynı menüyle sınırlıdır.

### Önizleme ile sipariş aynı kuralı uygular

Kontrol `buildQuote` içinde, yani sepet önizlemesi ile sipariş oluşturma aynı
noktadan geçiyor: **önizlemenin kabul ettiği vade siparişin de kabul ettiği
vadedir.** Önizlemeyi atlayıp doğrudan `/api/orders`'a POST atmak bir şey
kazandırmıyor.

### Ekranlar

| Yer | Ne yapılır |
|-----|------------|
| `/admin/payment-terms` | Vade tanımı ekle/düzenle/pasife al. Firmalara tanımlı vade **silinemez** — pasife alınır, o vadeyle satılmış siparişler açıklanabilir kalsın diye |
| `/admin/companies/[id]` | Bu firmaya sunulacak yöntemler + vade menüsü |
| Sepet paneli | Ödeme yöntemi ve vade seçimi. Vade yalnız cari borç doğuran yöntemlerde çıkar; yöntem peşine dönünce seçili vade düşer. Panelde "cari hesaba işlenir · 60 gün vade" satırı, siparişten **önce** ne olacağını söyler |
| Mobil sepet | Aynı menü, aynı kurallar — yöntem listesi `GET /api/payment-options`'tan geliyor. Cihaz listeyi tahmin etmiyor: nakit/havale ile kısıtlı bir müşteriye açık hesap göstermek, alıcının çözemeyeceği bir 422'den başka bir şey üretmezdi |

**Ödeme yöntemi etiketleri tek yerde** (`PAYMENT_METHOD_LABELS`, `@repo/types`).
Mobil uygulama bir zamanlar kendi kopyasını tutuyordu; enum ikiden beşe
çıkınca o kopya sessizce geride kaldı ve derlemeyi CI'da kırdı. Artık tek harita
enum'un yanında duruyor, yeni bir yöntem eklendiğinde derleyici onu kullanan
**her** ekranı aynı anda gösteriyor.

**Doğrulama:** 13 birim testi (toplam **174**) + betikli uçtan uca kontrol
**23/23**: menü firmaya göre daralıyor, kısıtlanan firmaya açık hesap 422,
alıcının uydurduğu 365 gün 422, peşine vade 422, seçilen 60 gün siparişe
yazılıyor, alıcı başka firmanın menüsünü okuyamıyor (403).

## 25. Hacim İskontosu (Adım 25)

"Cariye özel iskonto" zaten vardı (`CompanyDiscount` — kategori ya da ürün
bazında, pazarlıkla verilen oran). Eksik olan ikincisiydi: **işlem hacmine göre
iskonto** — müşterinin kendi cirosuyla hak ettiği oran.

### Merdiven herkese aynı teklif

`VolumeTier` — "son 12 ayda 500.000 ₺ alana %5". Tanımlar geneldir
(`/admin/volume-tiers`); tek bir cariye özel oran vermek isteyen kişi basamak
değil `CompanyDiscount` yazmalı. Ayrım önemli: basamak yazmak **tüm defteri**
yeniden fiyatlar.

Her firma, **hak ettiği en yüksek oranı** alır — en yüksek eşiği değil.
Basamakların dönemi farklı olabildiği için ("yılda 500.000" ile "ayda 80.000"
iki dürüst tekliftir) harcanan paraya göre sıralamak yılı ayla kıyaslamak
olurdu. Eşitlikte zor eşik kazanır, sonra id — aynı girdi hep aynı fiyatı
versin diye.

### Ciro ne demek

`subtotal − discountTotal − promotionTotal`, yani **fiilen ödenen mal bedeli**.

- **KDV yok:** devletin parası bizim ciromuz değil.
- **Navlun yok:** ağır mal alan müşteri, aynı değerde hafif mal alandan hızlı
  tırmanırdı.
- **Verilmiş iskonto düşülür:** müşteriyi kendisine verdiğimiz indirimle
  ödüllendirmek olurdu.
- **Taslak, iptal ve red sayılmaz** — kampanya motorunun `FIRST_ORDER` koşuluyla
  **aynı** küme (`order-status.ts`). Kampanyanın "eski müşteri" saydığı biri
  burada sıfır cirolu olamaz.

### Oran, firma iskontosunun üstüne biner

`resolvePrice` sırası: grup/adet kademesi → firma iskontosu → **hacim oranı**.
Üçüncü adım ikincinin kalanına uygulanır: %20 sonra %5, toplamda **%24** —
ticarette söylendiği gibi iskonto üstüne iskonto. Oranları toplasaydık cömert
bir özel anlaşma + üst basamak %100'e ulaşıp malı bedavaya verebilirdi.

`discountPerUnit` **toplam** iskonto olarak kaldı (`unitPrice − netUnitPrice`),
çünkü faturalama ve raporlama onu adetle çarpıyor. Hangi kısmın nereden geldiği
ayrı alanlarda: `companyDiscountPerUnit` / `volumeDiscountPerUnit`.

### Kazanılmış mı, söz verilmiş mi

`Company.volumeDiscountMode`:

| Mod | Davranış |
|-----|----------|
| `AUTO` (varsayılan) | Her fiyatlamada cirodan yeniden hesaplanır. Merdiven boşken herkes %0 alır, yani özellik açılmadan önce hiçbir fiyat değişmez |
| `MANUAL` | `volumeTierId` neyse odur; ciroya **hiç bakılmaz**. Boş bırakmak "bu cari hacim iskontosu almaz" demektir |

`MANUAL` pasife alınmış bir basamağı da onurlandırır: basamağı merdivenden
kaldırmak, onu bir müşteriye söz vermiş olmakla aynı şey değil — sözleşme
ortasında sessizce yeniden fiyatlamak daha kötü bir hata olurdu.

### Sipariş anlık görüntü alır

`Order.volumeTierName` + `volumeDiscountPercent`, `OrderItem.volumeDiscount`.
FK yok — vadede olduğu gibi: gelecek yıl "Altın %5"i emekliye ayırmak, bugün
kesilmiş bir siparişin fiyatını açıklayamaz hâle getirmemeli.

### Ekranlar

| Yer | Ne yapılır |
|-----|------------|
| `/admin/volume-tiers` | Basamak ekle/düzenle/pasife al. Firmaya atanmış basamak **silinemez** — pasife alınır, o müşteri söz verilen oranı kaybetmesin diye |
| `/admin/companies/[id]` | Mod seçimi + elle basamak ataması. Başlıkta **canlı** durum: hangi oran geçerli, son N ayın cirosu ne, bir üst basamağa ne kadar kaldı |
| Sepet paneli (web + mobil) | "Hacim iskontosu — Altın (%5), ara toplama dahil: −1.240 ₺". Ayrı bir indirim satırı değil: ara toplam zaten net, ikinci kez düşülüyormuş gibi okunmasın |
| Sipariş detayı | O gün geçerli olan basamağın adı ve oranı |
| Rapor tasarımcısı | `volumeTierName`, `volumeDiscountPercent`, satır bazında `volumeDiscount` |

Ciro `GET /api/volume-status` ile de okunabilir — yalnızca **gösterim**:
fiyatlanan oran her istekte sunucuda çözülüyor, bu uç atlanarak ya da
kandırılarak iskonto kazanılamaz.

**Aynı bayatlık üç yerde daha bulundu ve düzeltildi:** sipariş detayı ödemeyi
`=== "OPEN_ACCOUNT" ? "Açık hesap" : "Kredi kartı"` diye yazıyordu (çek "Kredi
kartı" görünüyordu), kampanya kural editörü ödeme yöntemi olarak yalnız iki
seçenek sunuyordu (çek/nakit/havaleye kampanya kurulamıyordu), iki rapor ekranı
da kendi iki üyeli etiket haritasını tutuyordu. Hepsi artık
`PAYMENT_METHOD_LABELS` / `PaymentMethodEnum` okuyor.

**Doğrulama:** 19 birim + 9 entegrasyon testi (toplam **202**). Entegrasyon
tarafı gerçek veritabanında kanıtlıyor: sıfır ciroda tam fiyat, eşik aşılınca
**sonraki** sipariş indirimli (eşiği aşan siparişin kendisi değil), katalogla
sepet aynı fiyatı gösteriyor, basamak siparişe yazılıyor, basamak emekliye
ayrılınca eski sipariş açıklanabilir kalıyor ama yeni sipariş kazanamıyor,
**siparişi iptal etmek iskontoyu geri alıyor**, ve `MANUAL` cari hiç alışveriş
yapmadan söz verilen oranla fiyatlanıyor.

## 26. Web Portal (`apps/web`)

| Sayfa | Rol | İçerik |
|-------|-----|--------|
| `/login` | herkes | Giriş; role göre ana sayfaya yönlendirir |
| `/sifremi-unuttum` | herkes | Sıfırlama bağlantısı talebi (yanıt her zaman aynı) |
| `/sifremi-unuttum/yenile` | bağlantı sahibi | Yeni şifre; kaydedince tüm oturumlar kapanır |
| `/portal` | 4 rol | **Vitrin:** kategori kenar çubuğu, arama (ad/marka/SKU/barkod), sıralama, stok filtresi, duyurular, sepet. Plasiyer/admin için önce firma seçimi |
| `/portal/urun/[id]` | 4 rol | Ürün detayı: görsel galerisi, künye, varyant tablosu (adet + satır toplamı) |
| `/portal/orders` | 4 rol | Firmanın sipariş listesi (personel salt okunur; vekil için seçili firma) |
| `/portal/statement` | 4 rol | Cari ekstre + yaşlandırma + CSV (vekil için seçili firma) |
| `/portal/users` | firma yöneticisi | Kendi firmasının kullanıcıları |
| `/portal/approvals` | firma yöneticisi | Onay bekleyen siparişler, onayla/reddet |
| `/orders/[id]` | 4 rol | Sipariş detayı: kalemler, toplamlar, adres, durum geçmişi, yetkiye göre durum butonları, irsaliye/fatura paneli |
| `/documents/shipments/[id]` | 4 rol (belgenin firması) | Yazdırılabilir irsaliye — fiyat yok |
| `/documents/invoices/[id]` | 4 rol (belgenin firması) | Yazdırılabilir fatura — vade, tutar, KDV kırılımı |
| `/admin` | süper admin | Cari hesap tablosu + tüm siparişler, limit override onayı |
| `/admin/products` | süper admin | Ürün listesi: arama, kategori filtresi, stok/varyant/fiyatsız uyarısı |
| `/admin/products/new` | süper admin | Yeni ürün formu |
| `/admin/products/[id]` | süper admin | Ürün düzenleme + varyantlar + fiyat kademeleri |
| `/admin/categories` | süper admin | Kategori ağacı yönetimi |
| `/admin/companies` | süper admin | Firma listesi: arama, pasif filtresi, bakiye/limit/vade |
| `/admin/companies/new` | süper admin | Yeni firma formu |
| `/admin/companies/[id]` | süper admin | Firma düzenleme + adresler + kullanıcılar + iskontolar |
| `/admin/users` | süper admin | Tüm kullanıcılar: oluştur, düzenle, şifre, pasife al, sil |
| `/admin/customer-groups` | süper admin | Müşteri grubu CRUD |
| `/admin/promotions` | süper admin | Kampanya listesi + kural tabanlı kampanya formu, kullanım/indirim özeti |
| `/admin/announcements` | süper admin | Vitrin duyuruları: şerit/bant/pencere, ton, öncelik, gruba özel hedefleme |
| `/admin/documents` | süper admin | Belge serileri: ön ek, basamak, sayaç, varsayılan, ERP serisi |
| `/admin/companies/[id]/statement` | süper admin | Herhangi bir firmanın cari ekstresi |
| `/admin/reports` | süper admin | Satış / ürün / plasiyer / tahsilat / alacak yaşlandırma (hazır raporlar) |
| `/reports` | süper admin, plasiyer, firma yön. | Kayıtlı raporlar ve paylaşılanlar |
| `/reports/new` · `/reports/[id]` | süper admin, plasiyer, firma yön. | Rapor tasarımcısı: alan seçimi, filtre, gruplama, dizayn, önizleme |
| `/admin/audit` | süper admin | Güvenlik kaydı: olay/tarih/metin filtreleri, "sadece güvenlik olayları", sayfalama + saklama/CSV paneli |
| `/admin/activity` | süper admin | Birleşik hareket akışı: sipariş durumu + cari + sistem kayıtları tek sütunda |
| `/hesabim` | 4 rol | Kendi profili, güvenlik durumu (son giriş + IP, şifre tarihi), şifre değiştirme, kendi hareketleri |
| `/rep` | plasiyer, süper admin | Portföy alacakları, vadesi geçenler, son 30 günün en iyileri, her firmadan **Sipariş · Tahsilat · Ziyaret** |
| `/rep/tahsilat` | plasiyer, süper admin | Tahsilat girişi (onay adımlı), firmanın tahsilat geçmişi, satır bazında iptal |
| `/rep/ziyaret` | plasiyer, süper admin | Açık ziyaret + kapatma, yeni ziyaret (not + konum), ziyaret geçmişi |
| `/403` | — | Yetkisiz erişim sayfası |

## 27. Mobil Uygulama (`apps/mobile`)

- Expo SDK 51, React Navigation (native stack), TanStack Query, Zustand, NativeWind.
- **Token cihaz keychain'inde** (expo-secure-store); açılışta `/api/mobile/me` ile doğrulanır, süresi dolmuşsa silinir.
- **Oturum ortada ölebilir:** hesap pasife alınır, rolü değişir ya da şifresi sıfırlanırsa jeton hâlâ imzalı ve süresi dolmamış olduğu için cihaz bunu kendi başına anlayamaz. İlk 401 (`SESSION_REVOKED` / `ACCOUNT_DISABLED` / `ACCOUNT_MISSING`) jetonu keychain'den siliyor ve giriş ekranına sebebini yazarak dönüyor.
- **Plasiyer akışı:** Müşterilerim (portföy, arama, bakiye + kullanılabilir limit) → Firma → Katalog / Sepet / Siparişler / Ziyaret / Tahsilat.
- **Firma kullanıcısı akışı:** doğrudan kendi firmasına düşer, plasiyer ekranları gizlidir.
- **Katalog:** firmaya çözülmüş fiyat, iskontolu fiyat üstü çizili gösterim, stok/koli/min bilgisi, stoksuz ve fiyatsız varyant sipariş edilemez.
- **Sepet:** koli katına yuvarlayan adet kontrolü, ödeme yöntemi seçimi, kupon alanı. **Firma bazlı** — müşteri değişince sıfırlanır (fiyat firmaya özeldir). Toplam **sunucudan** geliyor (`POST /api/orders/quote`): kampanyalar, hediyeler ve KDV cihazda değil sunucuda hesaplanıyor; cihazdaki toplam yalnızca istek uçarken görünen yer tutucu. Sepet satırları hâlâ cihazda tutuluyor (web sepeti sunucuda — bkz. Bilinen Eksikler).
- **Ziyaret (check-in):** GPS koordinatlı açılış, not, kapatma; geçmiş ziyaret listesi. **Konum best-effort** — izin reddedilse veya alınamasa bile ziyaret konumsuz kaydedilir, plasiyer bloklanmaz. Kayıtlar `MOBILE` damgasıyla yazılır (Adım 23) ve açık ziyaret varken yenisi açılamaz.
- **Tahsilat:** tutar (virgüllü klavye desteği), **tahsilat şekli** (nakit/havale/çek/senet/kart/diğer — Adım 23'te siparişin ödeme yönteminden ayrıldı), açıklama; sonuç bakiyesi sunucudan döner.
- **Sipariş detayı:** listeden dokunarak açılır — kalemler, toplamlar, sevkiyat adresi, kargo/takip bilgisi ve durum geçmişi. Salt okunur.
- **Cari ekstre:** limit/borç/alacak/bakiye özeti, yaşlandırma kovaları ve hareket listesi (telefonda okunaklı olsun diye en yeniden eskiye). Tahsilat ve sipariş sonrası kendini tazeler. Salt okunur.
- Türkçe para/tarih biçimlendirme, açık + koyu tema.

## 28. API Uçları

| Method | Yol | Roller |
|--------|-----|--------|
| POST | `/api/auth/[...nextauth]` | herkes (web cookie oturumu) |
| POST | `/api/auth/forgot-password` | herkes (yanıt her zaman aynı — hesap ifşa etmez) |
| POST | `/api/auth/reset-password` | bağlantı sahibi (token'ın kendisi kimlik) |
| POST | `/api/mobile/login` | herkes (bearer token üretir) |
| GET | `/api/mobile/me` | kimliği doğrulanmış |
| GET | `/api/catalog?companyId&categoryId&search` | 4 rol |
| GET | `/api/categories` | 4 rol |
| GET | `/api/companies` | kimliği doğrulanmış (role göre kapsam) |
| GET | `/api/companies/:id/statement?from&to` | kendi firması / portföy / hepsi |
| GET | `/api/companies/:id/aging` | kendi firması / portföy / hepsi |
| GET | `/api/reports/sales?from&to&companyId&limit` | süper admin, plasiyer (kendi portföyü) |
| GET | `/api/reports/products?from&to&companyId&limit` | süper admin, plasiyer (kendi portföyü) |
| GET | `/api/reports/collections?from&to&companyId&limit` | süper admin, plasiyer (kendi kaydettikleri) |
| GET | `/api/reports/receivables` | süper admin, plasiyer (kendi portföyü) |
| GET | `/api/reports/reps?from&to` | süper admin |
| GET | `/api/reports/datasets` | süper admin, plasiyer, firma yöneticisi |
| POST | `/api/reports/run` | süper admin, plasiyer, firma yöneticisi (kaydetmeden çalıştır) |
| GET · POST | `/api/reports/definitions` | süper admin, plasiyer, firma yöneticisi |
| GET · PATCH · DELETE | `/api/reports/definitions/:id` | sahibi + süper admin (okuma: paylaşıksa herkes) |
| GET | `/api/reports/definitions/:id/run` | okuyabilen herkes (kapsam çalıştırana göre) |
| GET · PUT · DELETE | `/api/cart?companyId=` | 4 rol (yalnızca kendi sepeti) |
| POST | `/api/cart/items` | 4 rol (tek satır ekle/güncelle/sil) |
| POST | `/api/admin/uploads` | süper admin (multipart görsel) |
| GET | `/api/activity?companyId&from&to&limit` | süper admin, plasiyer, firma yöneticisi (kapsamlı) |
| GET · POST | `/api/admin/audit/retention` | süper admin (durum / eski kayıtları sil) |
| GET | `/api/admin/audit/export?from&to` | süper admin (CSV akışı) |
| GET | `/api/admin/variants` | süper admin (hediye seçimi için varyant listesi) |
| GET | `/api/media/<klasör>/<dosya>` | herkes (katalog görseli) |
| POST · GET | `/api/orders` | 4 rol (kapsam role göre) |
| POST | `/api/orders/quote` | 4 rol (sepeti fiyatlar, sipariş oluşturmaz) |
| GET | `/api/orders/:id` | 4 rol (kendi firması / portföy / hepsi) |
| POST | `/api/orders/:id/status` | süper admin (sevkiyat), firma yöneticisi (iptal) |
| POST | `/api/orders/:id/approve` | firma yöneticisi, süper admin |
| POST | `/api/orders/:id/reject` | firma yöneticisi, süper admin |
| GET · POST | `/api/orders/:id/shipments` | okuma 4 rol (kendi kapsamı), yazma süper admin |
| DELETE | `/api/shipments/:id` | süper admin (faturalanmamışsa) |
| GET · POST | `/api/orders/:id/invoices` | okuma 4 rol (kendi kapsamı), yazma süper admin |
| GET · DELETE | `/api/invoices/:id` | okuma 4 rol (kendi kapsamı), iptal süper admin |
| GET · POST | `/api/admin/document-series` | süper admin |
| PATCH · DELETE | `/api/admin/document-series/:id` | süper admin |
| POST · GET | `/api/checkins?companyId=` | plasiyer, süper admin (GET listeyle birlikte açık ziyareti de döndürür) |
| POST | `/api/checkins/:id/checkout` | plasiyer, süper admin (yalnız açan kapatır) |
| POST · GET | `/api/payments?companyId=` | plasiyer, süper admin (firma verilmezse "kendi kaydettiklerim") |
| POST | `/api/payments/:id/reverse` | plasiyer (portföyü), süper admin — ters kayıt yazar, silmez |
| GET · POST | `/api/admin/companies?search&includeInactive` | süper admin |
| GET · PATCH · DELETE | `/api/admin/companies/:id` | süper admin |
| POST | `/api/admin/companies/:id/addresses` | süper admin |
| PATCH · DELETE | `/api/admin/addresses/:id` | süper admin |
| GET · POST | `/api/admin/users?search&companyId&includeInactive` | süper admin, firma yöneticisi (kendi firması) |
| GET · PATCH · DELETE | `/api/admin/users/:id` | süper admin, firma yöneticisi (kendi firması) |
| POST | `/api/admin/users/:id/password` | süper admin, firma yöneticisi (kendi firması) |
| GET | `/api/admin/sales-reps` | süper admin |
| GET · POST | `/api/admin/categories` | süper admin |
| PATCH · DELETE | `/api/admin/categories/:id` | süper admin |
| GET · POST | `/api/admin/products` | süper admin |
| GET · PATCH · DELETE | `/api/admin/products/:id` | süper admin |
| POST | `/api/admin/products/:id/variants` | süper admin |
| PATCH · DELETE | `/api/admin/variants/:id` | süper admin |
| GET · POST | `/api/admin/variants/:id/prices` | süper admin |
| DELETE | `/api/admin/prices/:id` | süper admin |
| GET · POST | `/api/admin/customer-groups` | süper admin |
| PATCH · DELETE | `/api/admin/customer-groups/:id` | süper admin |
| GET · POST | `/api/admin/companies/:id/discounts` | süper admin |
| DELETE | `/api/admin/discounts/:id` | süper admin |
| GET · POST | `/api/admin/promotions` | süper admin |
| GET · PATCH · DELETE | `/api/admin/promotions/:id` | süper admin |
| GET | `/api/admin/promotions/rules` | süper admin (kural kataloğu) |
| GET · POST | `/api/admin/announcements` | süper admin |
| PATCH · DELETE | `/api/admin/announcements/:id` | süper admin |
| GET · POST | `/api/admin/payment-terms` | süper admin |
| PATCH · DELETE | `/api/admin/payment-terms/:id` | süper admin (firmaya tanımlı vade silinemez) |
| GET | `/api/payment-options?companyId=` | 4 rol (yalnız gösterim — asıl kontrol `buildQuote`'ta) |
| GET · POST | `/api/admin/volume-tiers` | süper admin |
| PATCH · DELETE | `/api/admin/volume-tiers/:id` | süper admin (firmaya atanmış basamak silinemez) |
| GET | `/api/volume-status?companyId=` | 4 rol (yalnız gösterim — oran her fiyatlamada sunucuda çözülür) |
| GET | `/api/announcements` | 4 rol (kendi firmasının grubuna göre süzülür) |
| GET | `/api/catalog/:id` | 4 rol (fiyat firmaya göre çözülür) |
| GET · PATCH | `/api/account` | kimliği doğrulanmış (yalnız kendi hesabı) |
| POST | `/api/account/password` | kimliği doğrulanmış (yalnız kendi hesabı) |
| GET | `/api/account/activity` | kimliği doğrulanmış (yalnız kendi kayıtları) |
| GET | `/api/admin/audit` | süper admin (yalnız GET — POST/PATCH/DELETE 405) |

---

## Bilinçli Sınırlar

Bunlar çözülmeyi bekleyen eksik **değil** — gerekçesi olan karar. Kaldırılsalar
yerlerine geçtikleri şey (kayıt defterinin güvenlik sınırı, kredi limitinin
ölçüm anı, raporun okunabilirliği) bozulur. Bu yüzden yapılacaklar listesinde
değil burada duruyorlar.

- **Kullanıcı kendi JOIN'ini kuramıyor** — bir rapor tek veri kümesi okur; ilişkiler kayıt defterinde **bizim** bildirdiğimiz join'lerdir. Serbest JOIN, kayıt defterinin güvenlik sınırını (tanımlı olmayan alan yoktur) delerdi. Yeni bir ilişki gerekiyorsa kayıt defterine bir satır eklenir, arayüz kendiliğinden görür.
- **Çoka-çok ilişkiler alan olarak sunulmuyor** — firmanın adresleri, siparişin faturaları gibi liste ilişkiler satır çoğaltacağı için alan listesinde yok; bunlar kendi veri kümelerinden okunur.
- **Gruplanmış raporda 5.000 sınırı** — satır değil **grup** sınırı; aşılırsa sonuç `truncated` işaretiyle döner. 5.000 gruplu bir tablo zaten okunan bir rapor değildir.
- **Yaşlandırma tasarımcıyla ifade edilemiyor** — FIFO mahsup yürüyen bir hesap gerektirir; Adım 8'in yaşlandırma ekranı bu yüzden özel kod olarak kalıyor (satış/ürün/tahsilat raporları ise tasarımcıyla yeniden kurulabilir).
- **Faturada tek cari borç** — kısmi faturalar tek bir sipariş borcunu paylaşıyor; borç fatura başına parçalanmıyor (kredi limiti sipariş anında ölçüldüğü için borç da sipariş anında doğuyor). Vade en geç faturanın vadesine göre işliyor.

---

## Bilinen Eksikler

Gerçekten yapılacak işler. Sıra yaklaşık olarak maliyet/etki sırasıdır,
söz değildir.

### Yakın sırada

- **Yönetim ekranları henüz eski dilde (Faz 3)** — Faz 1 ortak katmanı, Faz 2 vitrini kurdu. Admin'in ~14 alt ekranı (firmalar, ürünler, kategoriler, kampanyalar, belgeler, raporlar, denetim…), rapor tasarımcısı ve sipariş detayı hâlâ ad-hoc Tailwind sınıflarında: yeni kabuğun içinde oturuyorlar, token'ları (yazı tipi, koyu tema, odak halkası) otomatik alıyorlar, ama kendi buton/tablo stilleri elle değişmedi. Bunlar vitrin kimliğini **almayacak** — yönetim tarafı nötr dilde kalır.
- **Kampanya performans raporu yok** — hangi kampanyanın ne kadar ciro/indirim ürettiği kayıtlı (`PromotionRedemption`) ama hazır bir rapor ekranı yok; rapor tasarımcısıyla da henüz veri kümesi olarak sunulmuyor. Veri zaten tutulduğu için iş, kayıt defterine bir veri kümesi eklemekten ibaret.
- **İş zamanlayıcı yok** — periyodik olması gereken iki iş de elle tetikleniyor: `purgePasswordResetTokens()` (süresi geçmiş sıfırlama biletleri) kod içinden çağrılıyor, denetim kaydı saklama temizliği ise `/admin/audit` ekranından. Bir cron/job runner gelene kadar ikisi de kimsenin hatırlamasına bağlı. Aşağıdaki yetim görsel temizliği ve ileride zamanlanmış raporlar da aynı runner'ı bekliyor.
- **Yetim görsel temizliği yok** — üründen kaldırılan görselin dosyası diskte kalıyor (`deleteMedia` var ama ürün kaydıyla ilişkilendirilmiş bir temizlik akışı yok). Zamanlayıcı gelmeden tek başına yapılmaz.
- **Tahsilatta mükerrer koruması yok** — ekranda onay adımı ve kilitlenen buton var, ama sunucuda idempotency anahtarı yok: aynı isteği iki kez gönderen bir istemci iki tahsilat yazar. İkincisi iptal kaydıyla geri alınabiliyor (Adım 23), yine de doğru çözüm istek başına anahtar.
- **Ziyaret raporu yok** — `CheckIn.source`, süre ve konum artık kayıtlı ama "kim kaç ziyaret yaptı, ne kadar sürdü, kaçı sahadan" sorusunu soran bir rapor/veri kümesi yok. Rapor kayıt defterine veri kümesi olarak eklenmesi gerekiyor.

### Mobil

- Sipariş detayı ve ekstre salt okunur; durum değiştirme yalnızca webde.
- **Sepet hâlâ cihazda** — web sepeti sunucuda (Adım 16), mobil uygulama kendi yerel sepetini kullanmaya devam ediyor; ikisi henüz aynı satırı paylaşmıyor.
- Uygulama gerçek cihazda çalıştırılmadı, yalnızca bundle edildi.

### Daha büyük

- **Hediye kademesi tek seviyeli** — "her 10 adette 1 bedava" var, ancak "10 alana 1, 50 alana 6" gibi artan kademe tek kampanyayla kurulamıyor; her kademe ayrı kampanya olur.
- **Görsel işlenmiyor** — yüklenen dosya olduğu gibi saklanıyor; küçük resim (thumbnail) üretimi, yeniden boyutlandırma ve WebP'ye dönüştürme yok. Depolama yerel disk; S3/MinIO sürücüsü yok.
- **Bildirim yalnızca e-posta** — SMS, push ya da uygulama içi bildirim yok; kullanıcı hangi bildirimi alacağını seçemiyor (abonelik tercihi yok). Önce sağlayıcı seçimi gerekir.

### Canlıya çıkışta çözülecek

Üçü de dağıtım topolojisine bağlı. Kurulumun şekli (kaç süreç, hangi ters vekil)
belli olmadan yazılacak kod tahmine dayanır — bu yüzden geliştirme sırasında
değil, canlıya çıkış turunda ele alınır.

- **Principal önbelleği süreç içi** — birden çok süreç/örnek çalışıyorsa bir süreçteki iptal diğerlerine ulaşmaz, oradaki oturum TTL kadar (5 sn) hayatta kalabilir. Yük dengeleyici arkasına konacaksa iptal sinyali paylaşılan bir kanala (Redis pub/sub) taşınmalı; TTL'i büyütmek çözüm değil.
- **Hız sınırı yalnızca giriş formunda** — diğer uçlar için genel bir istek sınırı yok; ters vekil (nginx/Cloudflare) katmanı varsayılıyor.
- **`x-forwarded-for` güvenilir vekil gerektirir** — güvenilen bir vekil üzerine yazmıyorsa adres istemci kontrolündedir. Hız sınırı bu yüzden maliyeti artıran bir fren, erişim denetimi değil.

### Dış bağımlılık bekliyor

- **E-Fatura/E-İrsaliye entegrasyonu yok** — belge üretiliyor ve yazdırılıyor, ancak GİB entegratörüne (EDM, Foriba, Sovos) gönderim yok. Çıktı tarayıcıdan yazdırma ile alınıyor; sunucu tarafı PDF üretimi yok. Kod ikinci adım: önce entegratör sözleşmesi (ücretli) gerekiyor.

## Sonraki Adımlar (planlanan)

Sıralama kesin değil — öncelik iş ihtiyacına göre belirlenecek.

### Yakın plan
- **Mobil tamamlama:** sipariş durum aksiyonları (şu an salt okunur), mobil sepetin sunucudaki `Cart` satırına taşınması, uygulamanın gerçek cihazda / Android emülatöründe koşturulması.
- **Sayfa düzeni editörü + "design admin" rolü:** duyuruların yeri/sırası kod yerine yönetim ekranından ayarlanabilsin; yeni bir yetki seviyesi gerekiyor (şu an 4 rol var).
- **Plasiyer hedef takibi:** hedef ataması ve "hedefe kalan" göstergesi; şemada henüz karşılığı yok. Hacim merdiveninin ciro toplayıcısı (`companyTurnover`) burada da işe yarar — ölçtüğü şey aynı.
- **Arayüz Faz 3:** yönetim ekranlarını paylaşılan Button/Card/Badge/Panel diline taşımak (vitrin kimliği yönetim tarafına uygulanmayacak).
- **İş zamanlayıcı:** dört iş aynı runner'ı bekliyor — süresi geçmiş sıfırlama biletlerinin temizliği, denetim kaydı saklama temizliği, yetim görsel temizliği, zamanlanmış rapor gönderimi.
- **Kampanya v3:** artan hediye kademesi ("10 alana 1, 50 alana 6" tek kampanyada) ve kampanya performans raporu (`PromotionRedemption` veri kümesi olarak sunulacak).
- **Rapor tasarımcısı v3:** zamanlanmış rapor + e-posta gönderimi, pano (birden çok raporu tek ekranda), hesaplanmış sütun (formül).
- **Stok hareket defteri:** çoklu depo + `StockMovement` defteri (ArcTeknik ERP şemasıyla hizalı).
- **Görsel işleme:** küçük resim üretimi, yeniden boyutlandırma, WebP dönüşümü; yerel diskin yanına S3/MinIO sürücüsü.

### Uzun vadeli backlog

**Operasyon & sipariş**
- İade & değişim (RMA): talep → onay → ters cari + ters stok hareketi.
- Teklif yönetimi: sepeti teklife çevir → plasiyer özel fiyat/vade → müşteri onayı → siparişe dönüşüm.
- Hızlı & periyodik sipariş: geçmiş siparişi kopyala, SKU+miktar CSV/Excel toplu sipariş, abonelik siparişi.

**Cari & finans**
- Sanal POS + taksit: iyzico / PayTR / banka VPOS, DBS (doğrudan borçlandırma).
- Çek/senet takibi: sahadan görselle giriş, vade takibi, risk hesabına işleme.
- E-Fatura / E-İrsaliye: özel entegratör (EDM, Foriba, Sovos) üzerinden belgelendirme + PDF.
- Vade farkı & erken ödeme iskontosu motoru: peşin/vadeli fiyat farkı, "10 günde öderse %2".
- Firma risk skoru + otomatik blokaj: vadesi geçmiş borçlu firmanın siparişi engellenir ya da onaya düşer (Adım 8'in yaşlandırma çıktısına dayanır).
- Holding/şube konsolidasyonu: şubeler kendi siparişini verir, limit + fatura ana caride birleşir.

**Yönetim**
- Fine-grained RBAC/ABAC: bölge bazlı firma görünürlüğü, kategori bazlı iskonto yetkisi (kural matrisi).
- Depo/şube bazlı stok + fiyat: carinin bağlı deposundan stok düşümü, bölgeye göre fiyat.

**Satış & pazarlama**
- Çapraz satış / muadil ürün: stoksuz üründe muadil önerisi, sepette "birlikte alınanlar".
- Matrix katalog: firma/bölge/anlaşma bazlı ürün-kategori görünürlüğü.
- Numune talebi: bedelsiz/indirimli numune isteği → onay → sevkiyat akışı.

**Depo & lojistik**
- Hacim/ağırlık (desi) bazlı sepet: nakliye hesabı, "min 1 palet / 1 tır" kısıtı.
- Sipariş birleştirme: aynı adrese aynı gün/hafta verilen siparişler tek irsaliyede.
- Teslimat randevusu: gün + saat aralığı (slot) seçimi.

**Saha satış & mobil**
- Offline-first: SQLite/WatermelonDB ile sipariş + tahsilat senkronizasyonu.
- Rota planlama: günlük/haftalık rota, haritada duraklar, ziyaret süresi, rota sapma raporu.
- Barkod/QR okuyucu: kamerayla sepete ekleme, depo teslimat doğrulama.

**Satış sonrası & bayi portalı**
- Garanti + yedek parça + patlatılmış şema: teknik çizimde numaralı parçaya tıkla → sepete ekle.
- Servis/arıza talebi (ticketing): garanti talebi ↔ yedek parça siparişi ilişkisi.
- Müşteri içi hiyerarşi + bütçe: satınalmacı / departman müdürü rolleri, aylık bütçe limiti.
- White-label katalog: bayinin kendi logosu + kendi satış fiyatlarıyla katalog modu / PDF.

**Veri & AI**
- Talep tahminleme + otomatik ikmal önerisi: geçmiş sipariş periyodundan "X ürününüz bitmek üzere".
- Dinamik fiyatlandırma motoru: maliyet artışına göre kural bazlı fiyat üretimi (Cost + %X marj).

**Platform & entegrasyon**
- ERP çift yönlü senkron (Logo, Mikro, SAP, Nebim, DIA): stok/fiyat/cari ERP→B2B, sipariş+tahsilat B2B→ERP.
- Bildirim motoru: FCM push + SendGrid/Twilio; sipariş durumu, onay bekleyen, limit aşımı tetikleyicileri.
- Çoklu para birimi + çoklu dil: USD/EUR/TRY fiyat listeleri, TCMB kur entegrasyonu.
- Dışa açık B2B API + Webhook + OpenAPI: büyük bayi kendi ERP'sinden otomatik sipariş geçer.
- Temsilci devir defteri: plasiyer değişince sipariş, çek-senet, ziyaret ve sepet devri.
- Sunum/maskeleme modu: plasiyer müşteri yanındayken maliyet ve diğer müşteri bakiyeleri gizlenir.
