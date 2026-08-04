# Özellik Envanteri

B2B Sipariş & Yönetim Sistemi'nde **şu an çalışan** özelliklerin listesi.

> **Güncelleme kuralı:** Her adım/commit sonunda bu dosya güncellenir. Bir özellik
> buraya ancak kodda çalışır durumdayken eklenir — planlananlar en alttaki
> "Sonraki Adımlar" bölümünde durur.

Son güncelleme: 2026-08-04 · Adım 12 sonu

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

---

## 1. Altyapı & Mimari

- **Turborepo + pnpm workspace** monorepo. Uygulamalar `apps/*`, paylaşılan kod `packages/*`.
- **Paketler:** `@repo/database` (Prisma client + şema + seed), `@repo/types` (Zod şemaları + tip literalleri), `@repo/auth` (Auth.js config + edge-safe RBAC), `@repo/services` (domain katmanı), `@repo/tsconfig`.
- **Uygulamalar:** `apps/web` (Next.js 14 App Router — hem portal hem API), `apps/mobile` (Expo SDK 51 / RN 0.74).
- **Postgres** Docker'da (host portu **5433**), Prisma migration'ları ile versiyonlu.
- Domain katmanı Prisma'ya bağımlı; edge'de çalışan kod (middleware, RBAC) Prisma'dan tamamen ayrı — edge runtime bozulmuyor.

## 2. Veri Modeli

| Model | İşlev |
|-------|-------|
| `User` | 4 rol, bcrypt şifre, firma üyeliği, plasiyer portföyü (`managedCompanies`), oturum sürümü (`tokenVersion`), giriş telemetrisi ve kilit alanları |
| `AuditLog` | Salt-ekleme güvenlik kaydı: kim, ne yaptı, hangi kayda, IP + tarayıcı. Kullanıcı silinse de e-posta denormalize saklandığı için okunabilir kalır |
| `Company` | Cari hesap: kredi limiti, güncel bakiye, **vade günü**, para birimi, sipariş onayı zorunluluğu, müşteri grubu, atanmış plasiyer |
| `Address` | Firma adresleri, varsayılan adres işareti |
| `CustomerGroup` | Fiyat kademesi grubu (Bayi, Toptancı, Zincir Market) |
| `Category` | Ağaç yapılı kategori (self-referans `parentId`) |
| `Product` / `ProductVariant` | Ürün + varyant (SKU, barkod, renk, beden, koli adedi, min sipariş, stok) |
| `Price` | Varyant × müşteri grubu × miktar kademesi fiyatı |
| `CompanyDiscount` | Firmaya özel iskonto (ürün veya kategori bazlı, yüzde ya da sabit) |
| `Order` / `OrderItem` | Sipariş başlığı + kalemler, fiyat anlık görüntüsü ile; kargo/takip no ve sevk/teslim/iptal zaman damgaları |
| `OrderStatusHistory` | Her durum geçişi: nereden nereye, kim, ne zaman, not (append-only) |
| `Transaction` | Cari defter (DEBIT/CREDIT), siparişe ve kaydeden kullanıcıya bağlı |
| `CheckIn` | Plasiyer saha ziyareti (GPS, giriş/çıkış saati, not) |
| `ReportDefinition` | Kullanıcı tanımlı rapor: veri kümesi + sütun/filtre/gruplama/dizayn (JSON), sahip, paylaşım |
| `Promotion` | Kampanya: koşul + aksiyon listeleri (JSON), kupon kodu, tarih penceresi, öncelik, tekillik, kullanım kotaları |
| `PromotionRedemption` | Hangi kampanya hangi siparişe ne kadar indirim verdi — aynı zamanda kota sayacı |
| `Cart` / `CartItem` | Taslak sepet (şema hazır — şu an sepet istemci tarafında tutuluyor) |

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
- Saha tahsilatı: plasiyer/admin tutar + ödeme yöntemi + açıklama girer, bakiye anında düşer.
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

## 13. Web Portal (`apps/web`)

| Sayfa | Rol | İçerik |
|-------|-----|--------|
| `/login` | herkes | Giriş; role göre ana sayfaya yönlendirir |
| `/portal` | firma yön./personel | Katalog, sepet, sipariş oluşturma |
| `/portal/orders` | firma yön./personel | Firmanın sipariş listesi (personel salt okunur) |
| `/portal/statement` | firma yön./personel | Kendi cari ekstresi + yaşlandırma + CSV |
| `/portal/users` | firma yöneticisi | Kendi firmasının kullanıcıları |
| `/portal/approvals` | firma yöneticisi | Onay bekleyen siparişler, onayla/reddet |
| `/orders/[id]` | 4 rol | Sipariş detayı: kalemler, toplamlar, adres, durum geçmişi, yetkiye göre durum butonları |
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
| `/admin/companies/[id]/statement` | süper admin | Herhangi bir firmanın cari ekstresi |
| `/admin/reports` | süper admin | Satış / ürün / plasiyer / tahsilat / alacak yaşlandırma (hazır raporlar) |
| `/reports` | süper admin, plasiyer, firma yön. | Kayıtlı raporlar ve paylaşılanlar |
| `/reports/new` · `/reports/[id]` | süper admin, plasiyer, firma yön. | Rapor tasarımcısı: alan seçimi, filtre, gruplama, dizayn, önizleme |
| `/admin/audit` | süper admin | Güvenlik kaydı: olay/tarih/metin filtreleri, "sadece güvenlik olayları", sayfalama |
| `/hesabim` | 4 rol | Kendi profili, güvenlik durumu (son giriş + IP, şifre tarihi), şifre değiştirme, kendi hareketleri |
| `/rep` | plasiyer | Portföy alacakları, vadesi geçenler, son 30 günün en iyileri |
| `/403` | — | Yetkisiz erişim sayfası |

## 14. Mobil Uygulama (`apps/mobile`)

- Expo SDK 51, React Navigation (native stack), TanStack Query, Zustand, NativeWind.
- **Token cihaz keychain'inde** (expo-secure-store); açılışta `/api/mobile/me` ile doğrulanır, süresi dolmuşsa silinir.
- **Oturum ortada ölebilir:** hesap pasife alınır, rolü değişir ya da şifresi sıfırlanırsa jeton hâlâ imzalı ve süresi dolmamış olduğu için cihaz bunu kendi başına anlayamaz. İlk 401 (`SESSION_REVOKED` / `ACCOUNT_DISABLED` / `ACCOUNT_MISSING`) jetonu keychain'den siliyor ve giriş ekranına sebebini yazarak dönüyor.
- **Plasiyer akışı:** Müşterilerim (portföy, arama, bakiye + kullanılabilir limit) → Firma → Katalog / Sepet / Siparişler / Ziyaret / Tahsilat.
- **Firma kullanıcısı akışı:** doğrudan kendi firmasına düşer, plasiyer ekranları gizlidir.
- **Katalog:** firmaya çözülmüş fiyat, iskontolu fiyat üstü çizili gösterim, stok/koli/min bilgisi, stoksuz ve fiyatsız varyant sipariş edilemez.
- **Sepet:** koli katına yuvarlayan adet kontrolü, KDV'li toplam önizlemesi, ödeme yöntemi seçimi. **Firma bazlı** — müşteri değişince sıfırlanır (fiyat firmaya özeldir).
- **Ziyaret (check-in):** GPS koordinatlı açılış, not, kapatma; geçmiş ziyaret listesi. **Konum best-effort** — izin reddedilse veya alınamasa bile ziyaret konumsuz kaydedilir, plasiyer bloklanmaz.
- **Tahsilat:** tutar (virgüllü klavye desteği), ödeme yöntemi, açıklama; sonuç bakiyesi sunucudan döner.
- **Sipariş detayı:** listeden dokunarak açılır — kalemler, toplamlar, sevkiyat adresi, kargo/takip bilgisi ve durum geçmişi. Salt okunur.
- **Cari ekstre:** limit/borç/alacak/bakiye özeti, yaşlandırma kovaları ve hareket listesi (telefonda okunaklı olsun diye en yeniden eskiye). Tahsilat ve sipariş sonrası kendini tazeler. Salt okunur.
- Türkçe para/tarih biçimlendirme, açık + koyu tema.

## 15. API Uçları

| Method | Yol | Roller |
|--------|-----|--------|
| POST | `/api/auth/[...nextauth]` | herkes (web cookie oturumu) |
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
| POST · GET | `/api/orders` | 4 rol (kapsam role göre) |
| POST | `/api/orders/quote` | 4 rol (sepeti fiyatlar, sipariş oluşturmaz) |
| GET | `/api/orders/:id` | 4 rol (kendi firması / portföy / hepsi) |
| POST | `/api/orders/:id/status` | süper admin (sevkiyat), firma yöneticisi (iptal) |
| POST | `/api/orders/:id/approve` | firma yöneticisi, süper admin |
| POST | `/api/orders/:id/reject` | firma yöneticisi, süper admin |
| POST · GET | `/api/checkins` | plasiyer, süper admin |
| POST | `/api/checkins/:id/checkout` | plasiyer, süper admin (yalnız açan kapatır) |
| POST | `/api/payments` | plasiyer, süper admin |
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
| GET · PATCH | `/api/account` | kimliği doğrulanmış (yalnız kendi hesabı) |
| POST | `/api/account/password` | kimliği doğrulanmış (yalnız kendi hesabı) |
| GET | `/api/account/activity` | kimliği doğrulanmış (yalnız kendi kayıtları) |
| GET | `/api/admin/audit` | süper admin (yalnız GET — POST/PATCH/DELETE 405) |

---

## Bilinen Eksikler

- **İrsaliye/fatura yok** — sevkiyat bilgisi kaydediliyor ama belge numarası üretilmiyor, çıktı alınamıyor.
- **Sevkiyat kısmi yapılamıyor** — sipariş tek parça sevk edilir, kalem bazlı kısmi sevk yok.
- **Vade tek bir sayı** — `paymentTermDays` firma genelinde; sipariş/fatura bazlı farklı vade tanımlanamıyor. Yaşlandırma da fatura değil, cari hareket bazlı.
- **Rapor tasarımcısının sınırları:** gruplama/özet bellekte yapılıyor (Prisma ilişki sütununa göre gruplayamıyor), bu yüzden özetli raporlar en fazla **20.000 satır** tarıyor; sınıra çarpınca sonuç `truncated` işaretiyle dönüyor ve arayüz uyarı gösteriyor. Detay listeleri sıralama ve limiti veritabanına ittiği için bu sınırdan etkilenmiyor.
- **Tasarımcıda veri kümeleri birleştirilemiyor** — bir rapor tek tablodan okur, JOIN kurulamaz (ilişkili alanlar kayıt defterinde hazır sütun olarak sunulur).
- **Yaşlandırma tasarımcıyla ifade edilemiyor** — FIFO mahsup yürüyen bir hesap gerektirir; Adım 8'in yaşlandırma ekranı bu yüzden özel kod olarak kalıyor (satış/ürün/tahsilat raporları ise tasarımcıyla yeniden kurulabilir).
- Mobil sipariş detayı ve ekstre salt okunur; durum değiştirme yalnızca webde.
- **Kupon yalnızca web portalında** — mobil sipariş ekranında kupon alanı yok; otomatik kampanyalar mobilde de uygulanır çünkü hesap sunucuda.
- **Kampanya "hediye ürün" veremez** — aksiyonlar yalnızca tutar düşer; sepete satır ekleyen (X alana Y bedava) kampanya yok. Kargo indirimi de yok, çünkü nakliye ücreti modeli henüz yok.
- **Kampanya kuralları arasında VEYA yok** — bir kampanyanın koşulları VE ile bağlanır; alternatif koşul için ikinci kampanya tanımlanır.
- **Sepet sunucuda tutulmuyor** — `Cart`/`CartItem` modelleri boş duruyor, sepet istemci belleğinde. Fiyat artık sunucudan geliyor (teklif ucu), ama sepetin kendisi hâlâ tarayıcıda.
- **"Şifremi unuttum" yok** — kullanıcı kendi şifresini değiştirebiliyor (Adım 11) ama unuttuysa hâlâ yöneticiden sıfırlatması gerekiyor; e-posta ile sıfırlama akışı yok (e-posta altyapısı da yok).
- **Denetim kaydında saklama/arşivleme politikası yok** — tablo sınırsız büyüyor, otomatik temizlik ya da dışa aktarma yok.
- **Denetim kapsamı yönetim işlemleriyle sınırlı** — kullanıcı/firma/oturum olayları kaydediliyor; sipariş ve cari hareketleri kendi geçmiş tablolarında (`OrderStatusHistory`, `Transaction`) duruyor, tek bir akışta birleşmiyorlar.
- **Kilitleme e-posta bazlı** — aynı IP'den farklı hesaplara yapılan denemeler ayrı ayrı sayılıyor, IP başına hız sınırı yok.
- **`tokenVersion` kontrolü her istekte bir sorgu** — istek başına `react/cache` ile tekil, ama Redis benzeri bir önbellek yok.
- **Görsel yükleme yok** — ürün görselleri elle URL olarak giriliyor.
- **ESLint yapılandırılmamış** — `pnpm lint` interaktif kuruluma düşüp hata veriyor.
- **Otomatik test yok** — doğrulama manuel E2E scriptleri + typecheck + build ile yapılıyor.
- Mobil uygulama gerçek cihazda çalıştırılmadı, yalnızca bundle edildi.
- Şifre sıfırlama, e-posta/bildirim yok.

## Sonraki Adımlar (planlanan)

Sıralama kesin değil — öncelik iş ihtiyacına göre belirlenecek.

### Yakın plan
- **Stok hareket defteri:** çoklu depo + `StockMovement` defteri (ArcTeknik ERP şemasıyla hizalı).
- **Promosyon motoru v2:** hediye ürün (X alana Y bedava), kargo/nakliye indirimi, kampanya koşullarında VEYA, mobilde kupon alanı, kampanya performans raporu.
- **Rapor tasarımcısı v2:** zamanlanmış rapor + e-posta gönderimi, pano (birden çok raporu tek ekranda), hesaplanmış sütun (formül), veri kümeleri arası birleştirme, veritabanı tarafında gruplama (20.000 satır tarama sınırını kaldırmak için).
- **Kalite:** ESLint kurulumu, domain katmanı için birim testleri, API için entegrasyon testleri, CI.

### Uzun vadeli backlog

**Operasyon & sipariş**
- Kısmi sevkiyat: `OrderItem.quantityShipped` / `quantityPending`, parçalı irsaliye-fatura.
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
- Firma & kullanıcı CRUD: şirket ekleme, kredi limiti + vade tanımı, şirket içi alt kullanıcı yetkileri.
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
- Audit log (KVKK/GDPR): fiyat/limit/yetki değişimi — kim, ne zaman, hangi IP; append-only.
- Temsilci devir defteri: plasiyer değişince sipariş, çek-senet, ziyaret ve sepet devri.
- Sunum/maskeleme modu: plasiyer müşteri yanındayken maliyet ve diğer müşteri bakiyeleri gizlenir.
