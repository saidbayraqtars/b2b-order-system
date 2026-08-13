# Özellik Envanteri

B2B Sipariş & Yönetim Sistemi'nde **şu an çalışan** özelliklerin listesi.

> **Güncelleme kuralı:** Her adım/commit sonunda bu dosya güncellenir. Bir özellik
> buraya ancak kodda çalışır durumdayken eklenir — planlananlar en alttaki
> "Sonraki Adımlar" bölümünde durur.

Son güncelleme: 2026-08-13 · Adım 54 (sayfa düzeni) sonu

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
| 25 | Hacim iskontosu: ciroyla hak edilen genel merdiven, firma başına otomatik/elle mod, siparişte anlık görüntü | ✅ |
| 26 | Kuruluş kimliği + kiracı klasörü: `tenants/<slug>/tenant.json`, belgede satıcı bloğu, marka dosyaları | ✅ |
| 27 | Kasa & banka defteri: peşin siparişin ve tahsilatın hesaba girmesi, elle giriş/çıkış, aktarım, gün sonu | ✅ |
| 28 | Sanal POS: ödeme sağlayıcı kayıt defteri, ödeme niyeti, kart parası tahsil edilene kadar kasaya girmez | ✅ |
| 29 | ERP köprüsü: müşterinin makinesindeki ajan, eşler-oluşturmaz, ERP bakiyesi ayrı kolonda | ✅ |
| 30 | Kullanıcı bazlı yetki (29 adlandırılmış izin, tik tik seçim) + yönetim panelinde gruplu kenar çubuğu | ✅ |
| 31 | Yetki kapsamı: izin ↔ hesap tipi (bayi/şirket/saha), kullanıcı ekranı hesap tipine göre ayrıldı | ✅ |
| 32 | Rapor tasarımcısına rol kabuğu (menü kaybolmuyor) + önizleme kendi sütununda | ✅ |
| 33 | Cari ekstre yazdırma görünümü (PDF olarak kaydet) | ✅ |
| 34 | Temsilci hedefleri: ziyaret + ciro, günlük/haftalık/aylık/yıllık, `targets.manage` izni | ✅ |
| 35 | Ziyaret çağrısı: bayi çağırır, plasiyerin gününe düşer, elle sıralanır | ✅ |
| 36 | Adres koordinatı + ziyaret ekranında harita ve sıralı rota / yol tarifi | ✅ |
| 37 | Etiket & fiş motoru: kargo etiketi + 80 mm fişler, tek/toplu basım, şablon tasarımcısı | ✅ |
| 38 | Kurye rolü: teslim listesi, imzalı belge fotoğrafı, teslim fişi, dağıtım ekranı | ✅ |
| 39 | Stok kartı alanları: alış fiyatı, birim, kritik stok, raf, pasif kart + depo bazlı stok | ✅ |
| 40 | Dağıtım: üretim imajı, göç konteyneri, sağlık ucu, kurulum/yedek/güncelleme betikleri | ✅ |
| 41 | Çek & senet portföyü: tahsilattan doğar, vade/banka/durum takibi, karşılıksızda borç geri açılır | ✅ |
| 42 | Döviz: liste fiyatı yabancı para olabilir, kur siparişe donar, defter TL kalır | ✅ |
| 43 | Bakım işleri: uygulama içi zamanlayıcı + tahsilatta tekrar anahtarı | ✅ |
| 44 | Rapor otomasyonu: ziyaret/kampanya veri kümeleri, zamanlanmış e-posta gönderimi, TCMB kuru + yönetim arayüzü Faz 3 | ✅ |
| 45 | Mobil tamamlama: sunucu sepeti, sipariş aksiyonları, ziyaret planı, hedefler, kurye ekranı, çek künyesi + kasa seçimi, yetkiye göre gezinme | ✅ |
| 46 | Tema motoru: isimli tasarım paketleri, çalışma zamanında geçiş | ↩ geri alındı (2026-08-10) |
| 47 | Rota testleri: uçların kendisi test altında — kimlik, yetki sınırı, firma kapsamı, sipariş/tahsilat/rapor davranışı | ✅ |
| 48 | Kurulabilir APK: sunucu adresi cihaz ayarı, uzaktan güncelleme (OTA), release imzası, EAS bulut derlemesi | ✅ |
| 49 | Saha üçlemesi: barkod/QR okuyucu, push bildirim, çevrimdışı çalışma | ✅ |
| 50 | Merkezden güncelleme: sürüm akışı, güncelleme ajanı, sürüm ekranı | ✅ |
| 51 | Stok hareket defteri: eldeki adet artık defterin bakiyesi — sipariş/iptal/sayım/aktarım/ERP farkı iz bırakır | ✅ |
| 52 | Döviz belgede: sipariş ve faturada "100,00 USD × 34,2150", firmanın sahte para birimi kaldırıldı | ✅ |
| 53 | Arayüz Faz 3 kapandı: `Checkbox` + `LinkButton` + yoğun kontrol boyu, rapor tasarımcısı ve sipariş detayı ortak dile taşındı | ✅ |
| 54 | Sayfa düzeni: vitrinin blok dizilimi veri, blok kayıt defteri, `/admin/sayfa-duzeni`, `design.manage` izni | ✅ |
| 55 | Kampanya v3: adet kademesi — `GIFT_TIER` (artan hediye) ve `PERCENT_OFF_TIER` (artan yüzde), tek kampanyada merdiven | ✅ |
| 56 | Rapor v3 (1/2): hesaplanmış sütun — çıktı sütunları üzerinde dört işlem, veritabanına gitmeyen formül dili | ✅ |

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
| `CashAccount` | Kasa / banka hesabı / POS: para birimi, devir bakiyesi, güncel bakiye, varsayılan işareti. Cari defterden **ayrı** — bu bizim paramız |
| `CashMovement` | Kasa defteri satırı: yön (IN/OUT), kaynak (sipariş/tahsilat/elle/aktarım), `occurredAt` (girildiği gün değil, olduğu gün), siparişe ve cari satırına bağ, `reversalOfId` + `counterpartId` (ikisi de tekil) |
| `PaymentMethodAccount` | Ödeme yöntemi → hesap eşlemesi. Birincil anahtar yöntemin kendisi: yöntem başına tek hesap, veritabanı garantisi |
| `PaymentIntent` | Kart tahsilatı: sağlayıcı (düz metin — kayıt defteri anahtarı), durum, tutar, taksit, sağlayıcı referansı, 3-D Secure yönlendirmesi. `cashMovementId` **tekil**: tahsilat iki kez deftere yazılamaz |
| `PaymentIntentEvent` | Bir ödemenin geçtiği her durum (ekle-only). Sağlayıcı yanıtı kart verisi ayıklanmış hâlde saklanır — PAN/CVV asla |
| `ReportDefinition` | Kullanıcı tanımlı rapor: veri kümesi + sütun/filtre/gruplama/dizayn (JSON), sahip, paylaşım |
| `Promotion` | Kampanya: koşul + aksiyon listeleri (JSON), koşul modu (VE/VEYA), kupon kodu, tarih penceresi, öncelik, tekillik, kullanım kotaları |
| `PromotionRedemption` | Hangi kampanya hangi siparişe ne kadar indirim verdi — aynı zamanda kota sayacı |
| `Cart` / `CartItem` | Sunucudaki sepet: **(firma, sahip)** başına tek satır, yalnızca varyant + adet tutar. Fiyat okurken çözülür |
| `PasswordResetToken` | "Şifremi unuttum" bileti: yalnızca token'ın SHA-256'sı, son kullanma ve harcanma zamanı |

- Para birimi alanları `Decimal(14,2)`; hesaplamalar `Prisma.Decimal` ile, float yok.
- `Price` varsayılan kademesi için **kısmi unique index** (`Price_variant_default_tier_key`) — Prisma ifade edemediği için elle SQL migration. Aynı gerekçeyle `CashAccount_single_default_key`: varsayılan kasa tek olmak zorunda.
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
- **Durum akışı:** firma onay istiyorsa + oluşturan personelse → `PENDING_APPROVAL`; açık hesap + limit aşımı → `PENDING_CREDIT`; aksi halde `CONFIRMED`. Kredi kartı cari borç yazmaz; onay anında bir **ödeme niyeti** açar (Adım 28) ve kasaya girişi tahsilat onayında olur.
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
- **İptal geri alır:** tüm kalemler stoğa iade edilir ve cari borç yazılmışsa ters kayıt (CREDIT) ile bakiye eski haline döner. Kredi kartı siparişinde cariye dokunulmaz — ters kayıt varsayımla değil, gerçek DEBIT satırı aranarak yazılır. Kasa kaydı ve kart tahsilatı da aynı anda çözülür (Adım 27–28): peşin para girdiği hesaptan çıkar, çekilmemiş kart tahsilatı iptal, çekilmiş olan **iade** olur.
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
- **Rota testleri** Adım 47'de eklendi (`apps/web/test`) — aşağıdaki bölüme bakın. Bugünkü toplam: **489 test / 36 dosya** (374 servis + 115 rota).
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

- Aksiyon `GIFT_ITEM`: hediye varyantı, adet, isteğe bağlı **"her N adette bir"** (`perMatch`) ve **üst sınır** (`maxQuantity`). Hedef ürün/kategori verilirse N sayımı yalnızca o satırlardan yapılır. Düz oran verir; **artan** kademe için Adım 55'in `GIFT_TIER`ine bakın.
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

## 26. Kuruluş Kimliği & Kiracı Klasörü (Adım 26)

Sistem fatura ve irsaliye basıyordu ama **kimin adına bastığını bilmiyordu**:
belgede yalnızca müşteri tarafı vardı, satıcının unvanı/VKN'si hiçbir modelde
yoktu. Bu, geçerli görünen geçersiz belge demekti.

Aynı boşluk, ürünün satış modelinin de ilk taşı: her müşteri firma **kendi
kurulumunda** çalışacak (kendi sunucusu ya da onun için alınan hosting), o hâlde
"satıcı kim" sorusu bir tablo değil, **kurulumun bir özelliği**dir.

### Kiracı klasörü

```
tenants/<slug>/
  tenant.json      satıcı kimliği, marka dosyalarının yolları
  branding/        logo, favicon, fontlar
```

**Dosya kaynaktır, veritabanı değil.** Klasör desteğin birimidir: alınır, elle
düzenlenir, geri gönderilir. Aynı bilgi veritabanında da dursaydı ikisi
kaçınılmaz olarak ayrışırdı — müşteri dosyayı düzenler, ekranda hiçbir şey
değişmezdi. Bu, bir destek akışı için mümkün olan en kötü sonuçtur.

`tenant.json` dosyanın **mtime**'ına göre önbelleklenir: dosyayı düzenleyip
sayfayı yenilemek yeter, sunucu yeniden başlatılmaz. Düzenleme döngüsünün
tamamı budur.

### Varsayılan yok, sessiz devam yok

Klasör `TENANT_DIR` ile bulunur ve **gömülü bir varsayılan yoktur**. Fatura basan
bir sistem, kimin adına bastığını bilmiyorsa başkasının adına basmaktansa
durmalıdır. Eksik ya da hatalı dosyada:

- Belge başlığında satıcı yerine **"Kurulum eksik — bu belge geçersizdir"** kırmızı
  bloğu ve hatanın tam sebebi çıkar. Sessizce satıcısız basmaz.
- Doğrulama **tüm eksikleri tek seferde** listeler; yarım dosya bir düzenlemede
  tamamlansın diye, alan başına gidiş-dönüş olmasın diye.
- Bu bir `BusinessError` **değildir** — iş kuralı değil, kurulum hatası. 4xx'e
  eşlenip "sen yanlış yaptın" gibi okunmamalı; operatörün sorunudur.

### Satıcı bloğu tek yerde

`DocumentShell` içinde. Fatura ile irsaliyenin firmayı farklı yazması bu yüzden
mümkün değil — bu oturumda üç kez düzeltilen "kapalı kümenin kopyası bayatlar"
hatasının belge tarafındaki karşılığı. IBAN listesi **yalnız faturada**:
irsaliye mal taşır, para değil.

### Marka dosyaları

`/api/branding/<dosya>` ile servis edilir, `public/` üzerinden değil — `public/`
derleme zamanı bir dizindir, kiracı klasörünün varlık sebebi ise **yeniden
derlemeden değiştirilebilmesi**. İki kapatma: uzantı sunduğumuz türlerden biri
olmalı, ve çözülmüş yol `branding/` içinde kalmalı (URL'ye yazılmış bir `../`
süreç ne okuyabiliyorsa okurdu). Logo genelde SVG ve SVG script taşıyabilir —
`Content-Security-Policy: default-src 'none'` + `nosniff` ile etkisizleştirilir.

### Ekranlar

| Yer | Ne yapılır |
|-----|------------|
| `/admin/organization` | Kuruluş bilgileri **salt okunur** + dosyanın tam yolu. Düzenleme formu bilerek yok: ikinci bir kaynak yaratırdı, operatör ekranda değiştirir, dosya başka şey söylemeye devam ederdi |
| Fatura / irsaliye | Başlıkta logo + unvan + adres + V.D./VKN + MERSİS/sicil + iletişim |

**Doğrulama:** 16 birim testi (toplam **218**) + betikli uçtan uca kontrol
**26/26**. Betik scratchpad'de: `verify-tenant.mjs`. Bozuk yapılandırma yolu da
canlıda sınandı: `tenant.json` bozulunca belge kırmızı uyarıyla çıkıyor, eski
unvan önbellekten **sızmıyor**, dosya geri konunca yeniden başlatmadan düzeliyor.

## 27. Kasa & Banka Defteri (Adım 27)

Cari defter (`Transaction`) **müşterinin borcunu** tutar. Peşin bir sipariş borç
doğurmadığı için oraya hiç yazılmıyordu — yani nakit/havale/kart bir sipariş
onaylandığında **para sistemde hiçbir iz bırakmıyordu**. "Bugün kasaya ne girdi"
sorusunun cevabı yoktu. Bu adım ikinci defteri kuruyor: **bizim paramız, nerede
duruyor.**

### İki tablo, iki soru

| Tablo | Cevapladığı soru |
|-------|------------------|
| `Transaction` | Bu müşteri ne kadar borçlu? |
| `CashMovement` | Elimizde ne kadar para var, hangi hesapta? |

`CashAccount` üç türde olur: **kasa** (elde nakit), **banka hesabı**, **POS**.
POS ayrı bir tür çünkü kart satışı *kazanılmış ama henüz elde olmayan* paradır;
bankaya karıştırmak, banka satırını bankanın kendi ekstresiyle çelişir hâle
getirirdi.

### Hangi para kasaya girer — tek karar noktası

`paymentMethodMeta()` tablosuna **ikinci bir alan** eklendi:
`settlesToCashAccount`. Bilerek `!createsReceivable` diye yazılmadı: ikisi farklı
soruları cevaplar (biri borç, diğeri eldeki para) ve bir yöntem **ikisine birden
hayır** diyebilir — konsinye ya da teminatlı satış gibi. Ayrı tutmak, böyle bir
yöntemin bir satır olarak eklenmesini sağlar, her yerde istisna olmasını değil.

| Yöntem | Cariye borç | Kasaya giriş |
|--------|-------------|--------------|
| Açık hesap | ✅ | — |
| Çek | ✅ | — |
| Nakit / Havale | — | ✅ sipariş onayında |
| Kredi kartı | — | ✅ **tahsilat onayında** (Adım 28) |

> Kredi kartı satırı Adım 27'de "sipariş onayında" idi ve **yanlıştı**: kimse
> kartı çekmeden para deftere giriyordu. Adım 28 araya ödeme niyetini koydu.

Tahsilat tarafında da aynı ayrım var: **çek ve senet kasaya girmez.** Kabul etmek
müşterinin borcunu kapatır, ama tahsil edilene kadar kasada para yoktur — nakit
saymak, kasada olmayan bakiyeyi rapor etmek olurdu. (Çek/senet portföyü sonraki
adım; o gelene kadar cariyi kapatıp kasaya dokunmamak en azından yalan değil.)

### Hangi hesaba

- **Sipariş:** `PaymentMethodAccount` eşlemesi (yöntem → hesap, birincil anahtar
  yöntem olduğu için "yöntem başına tek hesap" veritabanı garantisi). Eşleme
  yoksa **varsayılan hesaba** düşer. Sipariş gece yarısı müşterinin kendi
  tarayıcısından gelebilir; soracak kasiyer yok, karar önceden verilmiş olmalı.
  Eşleme yok diye siparişi reddetmek, muhasebe boşluğunu satış kaybına çevirirdi.
- **Tahsilat:** formda **açıkça seçilir** (boş bırakılırsa varsayılan). Burada bir
  insan var; mobil uygulamada seçici olmadığı için alan opsiyonel.

### Defter ekle-only

Cari defterden ödünç alınan iki kural:

- Yanlış kayıt **silinmez**, kendisine bağlı **ters kayıtla** iptal edilir
  (`reversalOfId`, unique — aynı hareket iki kez iptal edilemez, kontrolü kod
  değil veritabanı yapar). Kapanmış bir günün gün sonu sonradan sessizce
  değişemez.
- Bakiye ile hareketler **aynı veritabanı işleminde** yazılır.
  `CashAccount.currentBalance` bir kolaylıktır; başka yerden yazıldığı an yalan
  olur.

Sipariş ve tahsilat kaynaklı hareketler **elle iptal edilemez**: diğer yarısı bir
cari satırı ya da sipariş durumudur, tek başına geri alınırsa iki defter aynı
olay hakkında farklı şey söyler. Onlar siparişten/tahsilattan iptal edilir, ikisi
birlikte döner. İptal, parayı **girdiği hesaptan** çıkarır — eşleme sonradan
değişmiş olabilir, kayıt okunur, yöntemden tahmin edilmez.

### Aktarım

Kasadan bankaya yatırma **iki satırdır** (bir OUT, bir IN), birbirine bağlı. Tek
"transfer" satırı olsaydı her hesap ekstresi bazı satırların hangi yönden
okunduğuna göre ters sayılması gerektiğini bilmek zorunda kalırdı. Bir bacağın
iptali diğerini de iptal eder.

### Ekranlar

| Yer | Ne yapılır |
|-----|------------|
| `/admin/kasa` → Gün sonu | Tarih aralığı, toplam giriş/çıkış/net, hesaba ve kaynağa göre kırılım |
| `/admin/kasa` → Hareketler | Filtreli defter, elle giriş/çıkış (açıklama zorunlu), hesaplar arası aktarım, ters kayıtla iptal |
| `/admin/kasa` → Hesaplar | Hesap açma (devir bakiyesiyle), varsayılan seçimi, kapatma, yöntem → hesap eşlemesi |
| `/rep/tahsilat` | "Hangi kasaya girdi?" seçici; çek/senet seçilince yerine "kasaya girmez" açıklaması |
| Rapor tasarımcısı | **Kasa defteri** veri kümesi (yön, kaynak, hesap, hesap türü, sipariş, firma, kaydeden) — yalnız süper admin |

Devir bakiyesi (`openingBalance`) hesap açılırken **bir kez** verilir ve
düzenlenemez: bakiyeye doğrudan toplanır, hareketi yoktur; sonradan değiştirmek
izsiz para oynatmak olurdu. Yanlış devir, elle bir düzeltme kaydıyla düzeltilir.

**Doğrulama:** 4 birim + 13 entegrasyon testi (toplam **240**), typecheck + lint
+ build temiz.

## 28. Sanal POS & Ödeme Sağlayıcı (Adım 28)

Adım 27 kart siparişinin bedelini POS hesabına yazıyordu — ama kartı **kimse
çekmiyordu**. Elimizde olmayan paranın kaydı, ilkinden daha sinsi bir hata:
defter dolu görünüyor, kasa boş.

### Ödeme niyeti (`PaymentIntent`)

Sipariş ile paranın arasına giren adım. Kart siparişi onaylandığında **kasaya
hiçbir şey yazılmaz**; bir niyet açılır ve kasa ancak tahsilat gerçekleşince
haberdar olur.

| Durum | Anlamı |
|-------|--------|
| `PENDING` | Açıldı, çekilmedi. Elden POS'ta insan bekler; 3-D Secure'da müşteri bankadadır |
| `AUTHORIZED` | Kartta bloke var, para alınmadı |
| `CAPTURED` | Para alındı — **kasaya yazan tek durum** |
| `FAILED` / `CANCELLED` / `REFUNDED` | Reddedildi / vazgeçildi / iade edildi |

`PaymentIntentEvent` her geçişi saklar. Ödeme, sistemdeki **en çok tartışılan
kayıttır** — müşteri "ödedim" der, banka "gelmedi" der — bu yüzden son durum
değil, yolun tamamı tutulur.

### Kayıt defteri — güvenlik sınırı

`payment-provider-registry.ts`, `promotion-registry` / `report-registry` ile aynı
desende. Sipariş hattı **yalnızca arayüzü** bilir: `authorize`, `capture`,
`refund`, `complete3DS`, `verifyWebhook`.

Pazarlık konusu olmayan kural: **kart verisi bu sisteme girmez.** PAN yok, CVV
yok, son kullanma yok — ne parametrede, ne logda, ne `payload` alanında. Bu
yüzden `authorize()` kart numarası almaz, **müşterinin yönlendirileceği URL**
döner. Kart numarasına ihtiyaç duyan bir sağlayıcı bu kurulumu PCI-DSS kapsamına
sokardı; bir toptan sipariş sisteminin gireceği bir kapsam değil.

`verifyWebhook` ham gövdeyi alır, ayrıştırılmış nesneyi değil: her sağlayıcı
gönderdiği **baytları** imzalar, JSON'u yeniden serileştirmek onları değiştirir.
İmzayı doğrulayamayan sağlayıcı `null` döner — doğrulanmamış bir webhook,
yabancının siparişleri "ödendi" yapabildiği bir uçtur.

### Kutudan çıkan sağlayıcı: elden POS

`manual`. Hiçbir yere bağlanmaz: sipariş niyeti açar, niyet `/admin/kasa`
ekranındaki listede bekler, tezgâhtaki cihazdan çekimi yapan kişi **onaylar**.
Para deftere ancak o an girer.

Bu bir yer tutucu değil — tezgâhında banka POS'u olan bir işletme zaten böyle
çalışır. Ve önceki davranışın olmadığı bir şeydir: **dürüst.** Para, sipariş
kaydedildiği için değil, bir insan "çektim" dediği için görünür.

Gerçek sağlayıcının onay düğmesi **hiç çıkmaz** (`capabilities.manual`): iyzico'nun
tahsilatını elle "oldu" demek, parayı uydurmaktır.

### Seçim dosyada, anahtar ortamda

```json
"payment": { "provider": "manual", "installments": [], "autoCapture": false }
```

`tenant.json` **hangi sağlayıcı** ve **nasıl davranacağını** söyler. **Anahtarlar
buraya yazılmaz.** Kiracı klasörü destek akışının taşıma birimidir — elden ele
gider, e-postayla gönderilir, yedeklenir; oraya yazılan bir API anahtarı bu
yolculukların hepsine katılır ve gönderenden uzun yaşar. Sırlar ortamdan okunur:
`PAYMENT_<SAĞLAYICI>_<AD>` (`paymentSecret()`). Ad listesi sabit değil, çünkü her
sağlayıcının ihtiyacı farklı; adaptör neye ihtiyacı varsa okur.

Tanımsız sağlayıcı anahtarı **reddedilir** (`PAYMENT_PROVIDER_UNKNOWN`, 500 —
arayanın değil, kurulumun hatası). Sessizce "tahsilat yok, parayı yine de yaz"a
dönmez; Adım 28'in kaldırmaya geldiği davranış tam olarak buydu.

### Sıralama: sağlayıcı işlem içinde çağrılmaz

Niyet siparişin kendi veritabanı işleminde açılır (geri alınan siparişin
tahsilatı olmamalı), ama sağlayıcı **işlem kapandıktan sonra** çağrılır. Bankaya
giden bir ağ çağrısı sipariş satırının kilitlerini tutamaz — yavaş bir banka
sistemdeki her siparişi bekletirdi. Sağlayıcı çökerse sipariş **ayakta kalır**:
mal sipariş edildi, para henüz girmedi; hata niyetin üstüne yazılır.

### Onaylama iki kez para yazmaz

`PaymentIntent.cashMovementId` tekildir ve durum işlem **içinde** yeniden okunur:
çift tıklanan onayla düğmesi de, aynı anda onaylayan iki operatör de tutarı
ikinci kez yazamaz.

### Sipariş iptali

| Niyetin hâli | Sonuç |
|--------------|-------|
| Çekilmemiş (`PENDING`/`AUTHORIZED`) | `CANCELLED` — kasaya dokunulmaz, ortada para yok |
| Çekilmiş (`CAPTURED`) | `REFUNDED` + kasa kaydı ters kayıtla geri alınır |

İptal edilmiş siparişin tahsilatı **alınamaz**: sevk edilmeyecek mal için para
çekmek olurdu.

**Doğrulama:** 11 birim + 10 entegrasyon testi (toplam **261**), typecheck +
lint + build temiz.

## 29. Kullanıcı Bazlı Yetki & Yönetim Kabuğu (Adım 30)

Rol tek yetki kaynağıydı: `SUPER_ADMIN` her şeyi yapar, `COMPANY_STAFF` sipariş
girer, arası yok. Gerçek işletmede arası var — muhasebeci kasayı görür ama ürün
fiyatına dokunmaz, satış müdürü katalogu yönetir ama denetim kaydını dışa
aktarmaz. Bu adım yetkiyi rolden ayırdı.

### İzin kayıt defteri

`@repo/types/permission.ts` **29 adlandırılmış izin** tanımlar (`products.manage`,
`cash.view`, `orders.approve`, `audit.manage` …), altı grupta. Rol iki kaba işi
yapmaya devam eder — hangi bölüme (admin/portal/rep) girilir ve kullanıcı bir
firmaya bağlı mıdır — ama "neyi yapabilir" sorusunun cevabı artık kullanıcı
satırındaki `User.permissions` kümesidir.

- **Rol bir şablon, sınır değil.** Yeni kullanıcı formunda rol seçilince tikler
  o rolün varsayılanıyla dolar; sonrası tek tek açılıp kapatılır. Elle bir tik
  atıldıktan sonra rol değişse bile küme ezilmez.
- **Süper admin de izinlere tabi.** Rol bypass'ı olsaydı "her şeyi yapan ama
  kasaya giremeyen yönetici" imkânsız olurdu.
- **Enum değil `String[]`.** Ekran eklendikçe izin listesi büyüyor; her ekleme
  için migration yazmak listeyi kullanılamaz yapardı. Bilinmeyen anahtarlar
  okuma anında `sanitizePermissions` ile atılır.

### Yetki devrinin iki sınırı

| Koruma | Kural |
|--------|-------|
| `assertMayGrant` | **Kendinde olmayanı veremezsin.** Aksi hâlde kasaya erişimi olmayan firma yöneticisi kendine ikinci hesap açıp `cash.manage` verirdi. |
| `assertNotSelfLockout` | Kendi `users.manage` iznini kaldıramazsın — geri verecek kimse kalmaz. Rol/pasife alma tarafındaki `SELF_TARGET` korumasının izin karşılığı. |

Yetki kümesi değişince hedefin **oturumları sonlandırılır** (`tokenVersion`
artar) ve principal önbelleği düşer: kısılan yetki bir sonraki istekte hissedilir,
token süresi dolduğunda değil. Değişiklik `USER_PERMISSIONS_CHANGED` olarak
denetim kaydına verilen/kaldırılan izinlerle ayrı ayrı yazılır ve güvenlik
ekranında varsayılan olarak listelenir.

### Uygulama noktası

İzin kontrolü tek kapıda: `requireUser(roller?, izin?)` (API) ve
`requirePage(roller, izin?)` (ekran). Rol reddi ile izin reddi ayrı kaydedilir —
biri yapılandırma hatasına, diğeri çoğu zaman birinin yetkisinin kısılmasına
işaret eder. İzin eksikse ekran `/403?perm=…` sayfasına gider ve **hangi**
yetkinin eksik olduğunu söyler; kullanıcı yöneticisinden ne isteyeceğini bilir.

Bağlanan uçlar: 52 admin route dosyası + portal/saha/rapor uçları (siparişten
tahsilata, belgeden rapora). Menüler de izne göre süzülür — ama bu yalnızca
görgüseldir, ekranın kendisi ayrıca kapalıdır.

### Yükseltme güvenliği

Migration kolonu boş dizi ile ekler ama **her satırı o anki rolünün şablonuyla
doldurur**. Aksi hâlde migration'ın kendisi süper admin dâhil herkesi sistemden
kilitlerdi. Bir test, backfill listesinin kayıt defteriyle aynı kaldığını
doğrular: kayıt defterine izin eklenip backfill'e eklenmezse, yükselten
müşteride o yetki kimsede olmaz ve kimse geri veremez.

### Yönetim panelinde kenar çubuğu

18 düz bağlantı üst barda üç satıra sarıyordu: hiyerarşi yok, hepsi eşit
ağırlıkta, alan bitince satır ekleniyor. Yerine **gruplu sol kenar çubuğu**
(`SidebarShell`) geldi — Genel / Katalog / Müşteriler / Finans / Belge & Rapor /
Sistem. Kabuk 23 sayfada tek tek çizilmek yerine `admin/layout.tsx`'te bir kez
çiziliyor; aktif bağlantı `usePathname` ile en uzun eşleşen yoldan bulunuyor, yani
alt kırılımlar (firma detayı, ürün düzenleme) kendiliğinden üst bölümü işaretliyor.
Mobilde çekmece olur ve gezinme sonrası kapanır. Alıcı portalı ve saha ekranları
(5-6 bağlantı) üst barda kaldı.

**Doğrulama:** 11 yeni birim testi (kayıt defteri bütünlüğü + backfill tutarlılığı),
typecheck + lint temiz.

## 30. Yetki Kapsamı — Hangi İzin Hangi Hesaba (Adım 31)

Adım 30 yetkiyi rolden ayırdı ama yetki *verme* tarafında tek sınır vardı:
"kendinde olmayanı veremezsin". Süper adminde her izin olduğu için bu, bir bayi
personeline `organization.manage` ya da `orders.fulfil` vermeyi engellemiyordu.
Rol kapısı zararın bir kısmını tutuyordu (`/admin` yalnızca `SUPER_ADMIN`), ama
rol listesi olmayan uçlar — `requireUser(undefined, "orders.fulfil")` gibi —
doğrudan açıktı: müşteri hesabı satıcının sevkiyat ve fatura uçlarına
erişebiliyordu.

### Hesap tipi (rol ailesi)

| Aile | Roller | Ne demek |
|------|--------|----------|
| `SELLER` | SUPER_ADMIN | Kurulumun sahibi, satıcının iç ekibi |
| `DEALER` | COMPANY_ADMIN, COMPANY_STAFF | Müşteri tarafı |
| `FIELD` | SALES_REP | Saha |

`PERMISSION_SCOPE` her izne verilebileceği aileleri yazar. Yalnızca `SELLER`
olanlar satıcıya aittir: katalog ve fiyatlandırma, kasa **yönetimi** dışındaki
finans ayarları, sevkiyat/faturalama, sistem ayarları, denetim kaydı.

Kapsam **aile** düzeyinde, tek tek rol düzeyinde değil. Amaç bayi ↔ satıcı ↔ saha
sınırını korumak; aynı ailenin içindeki daha ince ayrım (firma yöneticisi onaylar,
personel onaylamaz) rol kapısının işi ve orada kalıyor.

### Üç yerde aynı kural

- **Servis:** `assertMayGrant(ctx, izinler, hedefRol)` artık iki şeye bakıyor —
  çağıranın kendi kümesi *ve* hedefin hesap tipi. İhlal 403 döner ve hangi izinler
  olduğunu söyler.
- **Rol değişimi arka kapıyı kapatır:** rol satıcıdan bayiye çekilirken izin
  listesi gönderilmezse, yeni tipe verilemeyen izinler **düşürülür** ve denetim
  kaydına yazılır. Aksi hâlde "rolü düşür, yetkileri bırak" kapsamı delerdi.
- **Ekran:** kapsam dışı kutu **pasif** durur ve nedenini söyler ("Bayi hesabına
  verilemez"); tamamı kapalı bir grup tek satıra iner. Gizlemek yerine pasif
  göstermek bilinçli — "burada bir şey yok" ile "burası bu hesaba kapalı" aynı şey
  değil. Çağıranın kendisinde olmayan izin ise hiç görünmez: orada kapalı olan şey
  hesap tipi değil, çağıranın yetkisi.

### Kullanıcı ekranı hesap tipine göre ayrıldı

Liste artık **Tümü / Şirket / Bayi / Satış temsilcisi** sekmeleri taşıyor (sayılarla),
her satırda hesap tipi etiketi var. Sekmeler yalnızca her firmayı gören ekranda;
firma detayında ve portalda liste zaten tek tip.

**Doğrulama:** 7 yeni birim testi (18 toplam) + uçtan uca kontrol: bayi personeline
`organization.manage` ve `orders.fulfil` 403, `reports.view` 200. Mevcut veritabanında
kapsam ihlali taşıyan hesap yok.

## 31. Paylaşılan Kabuk & Rapor Tasarımcısı (Adım 32-33)

Rapor tasarımcısı üç rol ailesine birden açık olduğu için hiçbir kabuğun içinde
değildi: içeri giren kullanıcı gezinme çubuğunu kaybediyor, elinde yalnızca çıkış
düğmesi kalıyordu.

- `RoleShell` rolüne göre doğru çerçeveyi çiziyor (süper admin → yönetim kenar
  çubuğu, plasiyer → plasiyer üst barı, bayi → portal üst barı) ve
  `app/reports/layout.tsx` bunu tüm `/reports` altına uyguluyor.
- **Önizleme kendi sütununa taşındı.** Bileşen zaten vardı ama tasarım sütununun en
  altındaydı; sütun/filtre listesi uzayınca ekranın dışına kayıyor ve "önizleme yok"
  gibi görünüyordu. Artık geniş ekranda üçüncü sütunda ve yapışkan; ayrıca elle
  "Yenile" düğmesi var.
- **Ekstre yazdırma görünümü** `/documents/statement/[companyId]` (tarih aralığı
  bağlantıda taşınıyor). Sunucu tarafı PDF üretilmiyor: tarayıcının "PDF olarak
  kaydet" adımı her makinede var, Türkçe karakterle sorun çıkarmıyor ve ekstrenin
  biçimi diğer belgelerle aynı kalıyor. İkinci bir düzen (ve font derdi) eklemek,
  ekstre değiştiğinde iki yerde birden değişmesi demekti.

## 32. Saha Hedefleri (Adım 34)

`SalesTarget(salesRepId, metric, period, periodStart, targetValue)`. İki ölçü
(**ziyaret noktası**, **ciro**) × dört dönem (günlük/haftalık/aylık/yıllık).

- **Dönem, tarih çifti değil "başlangıç + periyot"**: `periodStart` periyoda göre
  normalleştiriliyor (hafta pazartesi, ay ayın 1'i), `@@unique` bu sayede gerçekten
  "aynı dönem" demek. Aksi hâlde aynı ay iki farklı aralıkla iki kez tanımlanır ve
  hangisinin geçerli olduğu belirsiz kalırdı.
- **Gerçekleşen saklanmıyor**, her okunuşta hareketlerden hesaplanıyor: ziyaret =
  *kapanmış* check-in sayısı (açık check-in henüz ziyaret değil), ciro = temsilcinin
  girdiği iptal/ret/taslak dışı siparişlerin genel toplamı. Saklansaydı iptal edilen
  bir sipariş hedefi olduğundan iyi göstermeye devam ederdi.
- **`elapsed` ayrı bir sayı**: ayın 3'ünde %10 iyi, 28'inde felakettir; yüzde tek
  başına bu farkı gizler. Kart dönemin yüzde kaçının geçtiğini yanında yazıyor ve
  geride kalan hedefi sarıya çeviriyor.
- **Yeni izin `targets.manage`** (kapsam: yalnızca şirket). Hedefini *görmek* izin
  gerektirmiyor — temsilcinin paneli kendi karnesini her hâlükârda gösteriyor.

Ekranlar: `/admin/targets` (koyma + liste + dönem durumu), `/rep` üstünde karne.

## 33. Ziyaret Çağrısı & Harita (Adım 35-36)

`VisitRequest(companyId, salesRepId, requestedFor, note, status, sortIndex)`.

- Bayi `/portal/ziyaret` ekranından çağırıyor; çağrı o anki portföy sahibinin gününe
  düşüyor. **Aynı firmanın ikinci çağrısı yeni satır açmıyor**, mevcut olanı
  güncelliyor: "gelmediniz" diye üç kez basan bayi listeyi üç satırla doldurmamalı.
- Çağrı ≠ ziyaret. `CheckIn` kanıt, `VisitRequest` talep. Check-out yapıldığında o
  firmanın açık çağrısı `checkInId` ile eşleşerek kapanıyor — plasiyer aynı işi iki
  kez işaretlemiyor, karşılanmış çağrı listede "gelmediler" gibi durmuyor.
- **Sıra sunucuda** (`sortIndex`), tarayıcıda değil: sabah masaüstünde yapılan plan
  gün içinde telefonda aynı sırayla görünmeli. Sıralama isteği listenin tamamını
  gönderiyor; tek tek taşıma olsaydı araya giren bir değişiklikte sıra bozulurdu.
- **Adres koordinatı** (`Address.latitude/longitude`) eklendi. `CheckIn` zaten konum
  taşıyordu ama o *ziyaret olduktan sonraki* kanıt — güne başlarken haritada
  gösterilecek nokta yoktu.
- Ziyaret ekranında seçili durağın haritası (OpenStreetMap gömme görünümü), tek durak
  için yol tarifi ve **listedeki sırayla** çok duraklı rota bağlantısı. Harita
  kütüphanesi eklenmedi: ekranda gereken şey "burası neresi" ve "nasıl giderim";
  sürüklenebilir bir motor gerçek bir ihtiyaç çıkana kadar fazladan bağımlılık olurdu.

## 34. Etiket & Fiş Motoru (Adım 37)

`LabelTemplate(kind, name, widthMm, heightMm, blocks JSON)` + `/documents/labels`
basım görünümü.

- **Tasarım satır listesi**, mutlak koordinatlı kutular değil: 80 mm termal yazıcı
  satır satır basıyor, yüksekliği içerik belirliyor ve aynı mutlak konum iki yazıcıda
  iki farklı yere düşüyor. Satır türleri: metin, ayraç, boşluk, barkod, karekod,
  kalem tablosu, toplamlar, imza satırı.
- Alanlar `{{siparis.no}}` gibi işaretlerle yazılıyor; **tanınmayan işaret boş
  basılıyor**, olduğu gibi bırakılmıyor — müşterinin eline geçen fişte `{{firma.ad}}`
  yazması, o satırın hiç olmamasından kötü.
- Tür başına doldurulabilir alan listesi ayrı (`LABEL_FIELDS`): kargo etiketinde
  "teslim alan" yok, teslim fişinde kargo firması yok.
- **Tek uç, üç tür, toplu basım**: `?kind=ORDER_RECEIPT&orders=a,b` ya da
  `?kind=CARGO_LABEL&shipments=a,b`. Toplu basım ayrı bir ekran değil, aynı sayfaya
  birden çok kimlik verilmesi — iki farklı çıktı düzeni oluşmasın diye.
- Kâğıt ölçüsü `@page` ile şablondan geliyor; sipariş listesinde satır seçip toplu
  fiş, sipariş detayında sevkiyat başına kargo etiketi ve teslim fişi basılıyor.
- **Şablon tasarımcısı** `/admin/labels` (`labels.manage`): satır ekle/taşı/hizala/
  büyüt, kâğıt önizlemesi, "hazır tasarımdan yeni". Şablon hiç yoksa motor koddaki
  hazır tasarıma düşüyor — şablon tanımlanmadı diye fiş basılamaması kabul edilebilir
  değil.

## 35. Kurye & Dağıtım (Adım 38)

Yeni rol `COURIER`, yeni rol ailesi `DELIVERY`.

- **Neden ayrı aile**: kurye sahaya değil dağıtıma ait. Plasiyerle aynı ailede olsaydı
  sipariş girme, tahsilat ve ziyaret yetkileri ona da *verilebilir* hâle gelirdi; oysa
  kuryenin eline müşteri fiyatı bile geçmemeli. Kapsamı üç izin: `orders.view`,
  `documents.view`, `delivery.confirm`.
- `Shipment.courierId / deliveredAt / receivedByName / proofPhotoUrl / deliveryNote`.
  Depodan çıkaran (`shippedBy`) ile kapıya götüren ayrı: **teslim kanıtı götürene ait**.
- Teslim **bir kez** yazılıyor; teslim edilmiş sevkiyat yeniden teslim edilemiyor —
  imza kanıtının üstüne yazılabilmesi kanıt olmasını bitirirdi.
- Siparişin *tüm* sevkiyatları teslim edildiğinde sipariş `DELIVERED`'a geçiyor. Kısmi
  teslimde durum değişmiyor: yarısı kapıda olan sipariş "teslim edildi" sayılamaz.
- İmzalı belge fotoğrafı zorunlu değil (bazı teslimatlarda kâğıt hiç imzalanmıyor ve
  zorunlu alan sahte kayda iter), **teslim alanın adı zorunlu**. Yükleme kendi ucundan
  (`/api/deliveries/uploads`) geçiyor: ürün görseli ucu `products.manage` istiyor ve
  kuryeye katalog yetkisi vermek kabul edilemez.
- Ekranlar: `/kurye` (tek liste — yol tarifi, ara, teslim et, 80 mm fiş) ve
  `/admin/deliveries` (kurye atama, tümünü izleme).

## 36. Stok Kartı & Depo (Adım 39)

- `ProductVariant`: `costPrice` (alış fiyatı — müşteriye gösterilmez), `unit`,
  `minStock` (kritik eşik), `shelfCode` (raf), `isActive` (ERP'de pasife çekilen kart).
  Pasif varyant katalogda **hiç** görünmüyor ve siparişe eklenemiyor; satır
  silinmiyor çünkü geçmiş siparişler ona bakıyor.
- `Warehouse` + `VariantStock(onHand, reserved)`: ERP'de birden çok ambar var ve
  "stok var" cevabı hangi ambarda olduğuna göre değişiyor. `reserved` onaylanmış ama
  sevk edilmemiş siparişlerin tuttuğu adet; satılabilir = `onHand − reserved`. Tek
  kolona indirmek "stok var" deyip sevk edememe hatasını doğuruyordu.
- `ProductVariant.stock` toplam olarak kalıyor ve kırılım her değiştiğinde **tek
  yerden** yeniden yazılıyor (`setVariantStock`): katalog listesi tek satırda "var mı"
  sorusunu depo tablosuna gitmeden cevaplayabilmeli.
- Kritik stok listesi yalnızca eşiği **tanımlı** satırları alıyor: eşiksiz her ürünü
  listelemek uyarı listesi değil, ürün listesi olurdu.

## 37. Dağıtım & İşletim (Adım 40)

Sistem **her müşteri için ayrı kurulur**: kendi sunucusu,
kendi veritabanı, kendi kiracı klasörü. Bu adım o kurulumun nasıl açıldığını,
güncellendiğini ve geri alındığını yazılı hâle getiriyor. Ayrıntı: `DEPLOYMENT.md`.

### İmaj: iki hedef, tek Dockerfile

- **runner** — Next `output: "standalone"` çıktısı. İzlenmiş dosyalar, `node`
  kullanıcısı, `prisma` CLI ve migration dosyaları **yok**: çalışan sunucuda
  durmaları yalnızca saldırı yüzeyi.
- **migrator** — derleme katmanının üstünde; `prisma migrate deploy` çalıştırıp
  çıkar. `bootstrap.ts` de bu kapsayıcıdan koşuyor.

**Göç web'in açılışında çalışmıyor.** Öyle olsaydı iki kopya birden
başlatıldığında ikisi de şemaya girerdi. Compose'da web `migrate` servisinin
`service_completed_successfully` koşuluna bağlı: göç bitmeden başlamıyor, göç
düşerse hiç başlamıyor — yarım şemayla servis vermek en kötü sonuç.

### Sızıntı: geliştirme sırrı imaja giriyordu

Doğrulama sırasında imajın içinde `/app/apps/web/.env` bulundu. `.dockerignore`
kalıpları **tam yola** bakıyor, dosya adına değil: yalın `.env` yalnızca kökteki
dosyayı eliyor. Next standalone çıktısı uygulama dizinindeki `.env`'i taşıyor ve
**çalışma anında yüklüyor** — yani geliştiricinin yerel `AUTH_SECRET`'i
müşterinin sunucusunda geçerli imza anahtarı oluyordu. İki kilit kondu: kalıp
`**/.env` yapıldı ve derleme aşamasında bağlamda kalan her `.env` siliniyor.

`mobile-token.ts` içindeki `AUTH_SECRET ?? "dev-insecure-secret-change-me"`
varsayılanı da kaldırıldı: üretimde anahtar yoksa jeton **imzalanmıyor da
doğrulanmıyor da**. O sabit depoda yazılı — bilen herkes kendine SUPER_ADMIN
jetonu üretebilirdi.

### Açılışta yapılandırma denetimi

`src/instrumentation.ts` süreç açılışında `assertRuntimeEnv()` çağırıyor.
Üretimde `DATABASE_URL`, `AUTH_SECRET`, `TENANT_DIR`, `APP_URL`, `UPLOAD_DIR`
zorunlu; kısa ya da geliştirme sabitine eşit `AUTH_SECRET` ve localhost'a bakan
`APP_URL` ölümcül sayılıyor. SMTP boşluğu ve `http://` uyarı olarak günlüğe
düşüyor, süreci durdurmuyor.

`UPLOAD_DIR` listede çünkü varsayılanı `process.cwd()/uploads`: kapsayıcıda bu,
imaj her güncellendiğinde silinen bir dizin demek — yüklenen ürün görselleri
sessizce kaybolurdu.

Hata durumunda süreç **açıkça düşürülüyor** (`process.exit(1)`). Next bu
kancadaki hatayı yakalayıp "Failed to prepare server" yazıyor ve süreci ayakta
tutuyor; sonuç `docker ps` çıktısında "Up" görünen ama hiçbir isteğe cevap
vermeyen bir kapsayıcı olurdu.

### `GET /api/health`

Kimlik istemiyor — sağlık kontrolünü yapan şey (Docker, ters vekil, güncelleme
betiği) oturum açamaz. Dört kontrol: `database` (bağlantı **ve** yarım kalmış
migration), `tenant` (`tenant.json` okunabiliyor), `uploads` (dizin yazılabilir),
`config` (zorunlu değişkenler dolu). Hepsi geçerse 200, değilse 503.

Dışarı yalnızca evet/hayır çıkıyor: hata metni bağlantı dizesi ve dosya yolu
sızdırır, sağlık ucu keşif aracı olmamalı. `version` alanı imaj etiketiyle aynı
değer — güncelleme betiği "yeni sürüm gerçekten ayağa kalktı mı" sorusunu buna
bakarak yanıtlıyor; 200 dönen ama hâlâ eski kopya olan bir sunucu "başarılı"
sanılmasın.

### `seed.ts` üretimde çalıştırılmaz

Geliştirme seed'i `admin@b2b.local` / `Password123!` açıyor — ikisi de depoda
yazılı. Üretim için ayrı giriş noktası: `prisma/bootstrap.ts`. Operatörün
verdiği e-posta/şifreyle **tek** süper admin, belge serileri ve hazır etiket
tasarımları; tek gösterim satırı yazmıyor. Hesap zaten varsa **şifresine
dokunmuyor**: aksi hâlde güncelleme betiğinin yanlışlıkla çalıştırılması,
müşterinin kendi değiştirdiği şifreyi eskisine döndürürdü.

Ortak başvuru verisi (`prisma/reference-data.ts`) seed ile bootstrap arasında
paylaşılıyor — belge serisi olmayan kurulum irsaliye numaralandıramaz, yani
sevkiyat yapamaz.

### Betikler

| Betik | Ne yapar |
|---|---|
| `install.sh` | Yapılandırmayı doğrular → derler → şemayı kurar → yönetici hesabını sorar → web'i açar. Herhangi bir adım düşerse orada durur |
| `backup.sh` | Veritabanı (`pg_dump -Fc`) + görseller + kiracı klasörü, tek dizinde; eski yedekleri süreye göre siler |
| `restore.sh` | Yedekten döner; veritabanını **siler**, `--force` yoksa onay ister |
| `update.sh` | Yedek → derle → göç → geçir → sağlığı bekle; tutmazsa eski imaja döner |

**Şema göçü geri alınamaz.** `update.sh`'ın geri aldığı şey *uygulama
sürümüdür*; yeni sürüm bir kolon düşürdüyse eski imaja dönmek onu geri
getirmez. Yedek adımı bu yüzden varsayılan, `SKIP_BACKUP=1` açık bir tercih.
Göç düşerse betik web'e **hiç dokunmadan** duruyor: eski sürüm çalışmaya devam
eder, şema da eskidir.

### Kalıcı veri

Veritabanı ve yüklenen görseller birimde; kiracı klasörü host'tan **salt
okunur** bağlanıyor (destek akışında elden ele giden bir klasör ve uygulamanın
oraya yazması gereken hiçbir şey yok). İmajın içinde kalıcı hiçbir şey yok —
güncelleme kapsayıcıyı değiştirir, veriyi değil.

## 38. Çek & Senet Portföyü (Adım 41)

Çek tahsilatı cariyi kapatıyor ve kasaya girmiyordu — kâğıt henüz para değil.
Ama kâğıdın kendisi **hiçbir yerde** kayıtlı değildi: vadesi, hangi bankanın,
tahsil mi oldu karşılıksız mı çıktı, kime ciro edildi.

- Kâğıt tahsilattan **doğar**, elle yazılmaz. Bağlantı zorunlu ve tekil:
  hiçbir borcu kapatmamış kâğıt da, kimsede olmayan kâğıtla kapanmış borç da
  temsil edilemez.
- Para kasaya **tahsilde** girer, tahsilatta değil, ve kendi kaynağıyla: aylar
  önce kapanan bir borcun bugün gelen parası, bugünkü tahsilat gibi görünmemeli.
- Karşılıksızda kapanan borç geri açılır — ters kayıt, satır silme değil.
- Ayrı izin: `cheques.manage`.

## 39. Döviz (Adım 42)

Fiyat kolonlarındaki `currency` alanı vardı ve hepsi "TRY" tutuyordu; alan bir
özellik değil, yer tutucuydu.

- **Defter TL kalır**, kur siparişe donar. Çok para birimli defter, her bakiyeye
  "hangi kurla" sorusunu iliştirir ve tek bir ekstre basılamaz hâle getirir.
- Çevrim fiyatlamadan **önce**: fiyat satırı TL'ye çevrilir, sonra iskonto,
  hacim basamağı ve KDV eskisi gibi çalışır. `pricing.ts` para biriminden hâlâ
  habersiz ve dört yerine tek bir yuvarlama kararı var.
- Kuru olmayan para biriminde fiyatlama **reddedilir** (`MISSING_EXCHANGE_RATE`,
  409): eksik olan girdi değil, kurulumun kendisi.

## 40. Bakım İşleri & Tekrar Anahtarı (Adım 43)

İki ayrı yer, tek soru: **aynı iş iki kez yapılırsa ne olur?**

### Zamanlayıcı

Süresi geçmiş şifre biletleri, denetim kaydı saklama süresi, yetim görseller,
terk edilmiş sepetler: hepsi periyodik olması gereken ama kimsenin
hatırlamasına bırakılmış işlerdi.

- İşler bir **kayıt defteri** (`job-registry.ts`) — bu depoda tanıdık desen
  (rapor veri kümeleri, kampanya kuralları, ödeme sağlayıcıları). İş veri,
  zamanlayıcı yalnızca çalıştıran.
- Her işin tek sözü var: **yeniden çalıştırılabilir olmak.** Çökme, yeniden
  başlatma ve elle tetikleme aynı işi iki kez çalıştırabilir.
- Zamanlayıcı uygulamanın **içinde** çalışıyor, ayrı bir cron kapsayıcısı değil:
  müşteri başına ikinci bir dağıtım birimi, kazandırdığından fazla yük getirirdi.
- Bunun bedeli iki kopyanın aynı turu koşturması; ödeyen mekanizma
  **sahiplenme**: iş, `nextRunAt`'i ileri atan tek bir
  `UPDATE ... WHERE nextRunAt <= now()` ile alınır. Satırı güncelleyebilen kopya
  çalıştırır, diğeri sıfır satır günceller ve hiç başlamaz. "Önce bak, sonra
  çalıştır" yarışa açıktı ve denetim kaydını iki kez budardı.
- Patlayan iş yutulmuyor ama yayılmıyor da: `JobRun` satırı ERROR olarak kalıyor,
  ekranda kırmızı duruyor, diğer işler etkilenmiyor.
- `/admin/jobs`: son çalışma, sıradaki çalışma, periyot, aç/kapat, "şimdi
  çalıştır". Ayar değişikliği denetim kaydına yazılıyor — kapatılmış bir temizlik
  işi haftalar sonra sorulduğunda kimin kapattığını gösterecek tek kayıt.
- Ayrı izin: `jobs.manage`.

### Tahsilatta tekrar anahtarı

Ekrandaki onay adımı ve kilitlenen düğme, ağ koptuğunda yeniden gönderen bir
istemciyi durdurmuyordu — kullanıcı da "kaydedildi mi" bilemediği için tekrar
basıyordu.

- `Transaction.idempotencyKey` **tekil**: ikinci isteği veritabanı reddediyor.
  Uygulama kodundaki "önce bak sonra yaz" yarışa açıktı.
- Aynı anahtarla gelen ikinci istek ilkinin sonucunu aynen döndürüyor — istemci
  açısından istek başarılı, çünkü gerçekten başarılı oldu, sadece daha önce.
- Eşleşme yalnızca **aynı firma** için kabul ediliyor: anahtar istemciden geliyor
  ve tahmin edilebilir bir değer gönderen biri başka firmanın kaydını okuyabilirdi.
- Anahtarsız istek korumasız: aynı tutarı iki kez tahsil etmek meşru bir durum.

## 41. Rapor Otomasyonu & Yönetim Arayüzü Faz 3 (Adım 44)

Rapor motoru Adım 21'den beri duruyordu ama iki soruyu cevaplayamıyordu ve
kimseye kendiliğinden bir şey göndermiyordu.

### Ziyaret raporu

- `CheckIn.durationMinutes` **yazılıyor**, hesaplanmıyor: rapor motorunda ifade
  desteği yok, türetilmiş bir sütun hem SQL hem Prisma yolunda ayrı ayrı
  yazılırdı ve ikisi zamanla ayrışırdı. Çıkışta bir kez yazılıyor, saat geri
  giderse (NTP düzeltmesi) sıfıra kırpılıyor — negatif dakika bir ortalamayı
  zehirler.
- Göç, kapanmış ziyaretleri geriye dönük dolduruyor: değer bugün türetilebilir
  durumda ve boş bırakmak, raporun ilk ayını "kimse çalışmamış" gibi gösterirdi.
- Veri kümesine `source` de eklendi. Ayrım önemli: telefon müşterinin kapısında
  gerçek GPS okuyor, masadaki tarayıcı işletim sisteminin tahminini bildiriyor.
  Bu sütun olmadan ofiste sonradan girilen ziyaret, sahada yapılanla aynı
  görünüyordu.

### Kampanya performans raporu

- Yeni veri kümesi `PROMOTIONS` (`PromotionRedemption` üzerinde): kampanya × sipariş.
  "Kaç kez kullanıldı, ne kadar indirim verdi, yanında ne kadar ciro geldi."
- İptal edilen siparişin kullanım satırı siliniyor, dolayısıyla rapor **ayakta
  duran** siparişleri sayıyor.
- Siparişin kendi toplamı da taşınıyor ama **siparişin tamamının** toplamı:
  bir siparişte iki kampanya varsa `orderGrandTotal` toplamı çift sayar.
  Toplanması güvenli olan tek sütun `amount` — kampanyanın kendi rakamı.
- Kapsam sipariş veri kümeleriyle aynı: plasiyer kendi portföyünü, alıcı yalnızca
  kendi aldığı indirimleri görüyor. Bayinin bütün kampanyaları okuması, satıcının
  başka bayilere ne verdiğini öğrenmesi olurdu.

### Zamanlanmış rapor gönderimi

- Tarife raporun **üstünde** (ayrı tablo değil): rapor başına en fazla bir tane ve
  ikisi birlikte siliniyor — silinmiş bir raporu gösteren tarife, kimsenin ele
  alması gerekmeyen bir durum.
- Rapor **sahibinin** yetkisiyle çalışıyor, "sistem" adına değil: tanımlar
  paylaşılabiliyor ve motor çalıştıranın kapsamını uyguluyor. Kapsamsız çalışan
  bir rapor, plasiyerin paylaştığı sayfaya bütün firmayı doldururdu.
- Sahiplenme iş zamanlayıcısındakiyle aynı: `scheduleNextRunAt`'i ileri atan tek
  bir UPDATE. İki kez giden rapor, güvenilmeyen rapordur.
- Bir raporun patlaması turu durdurmuyor; sonuç raporun kendi satırına yazılıyor
  (`scheduleLastStatus`), böylece hata iş günlüğünde değil raporun yanında duruyor.
- Sahibi pasifleştirilmişse gönderim **duruyor**: alıcıların gördüğünden sorumlu
  kişi ortada yok.
- Ek CSV: noktalı virgül ayraçlı ve BOM'lu — Türkçe Excel'de virgül ondalık
  ayracı, virgüllü dosya tek sütuna düşüyor; BOM olmadan her "ş" bozuluyor.
- Alıcı listesi serbest e-posta adresi: haftalık satış tablosunu bekleyen kişi
  çoğu zaman sistemde hesabı olmayan biri (mali müşavir, patron).

### TCMB kuru

- Kur elle giriliyordu; girilmediği gün dövizli ürünler **satılamıyordu**.
- Saatte bir bülten çekiliyor. Sıklığın sebebi kurun saatte bir değişmesi değil,
  tek denemenin ağ hatasına denk gelip günü kursuz bırakmaması.
- **Satış** kuru alınıyor (`ForexSelling`): mal alımı satış kuruyla değerlenir.
  Bültendeki birim çarpanı bölünüyor (JPY 100 birim üzerinden yazılıyor).
- `validFrom`, bültenin gününün İstanbul yerel başlangıcı — aynı gün ikinci kez
  çalışmak aynı satırı güncelliyor, yenisini eklemiyor.
- Elle giriş kaldırılmadı: sabit kur ya da banka kuru kullanan satıcı için son
  yazılan satır geçerli olmaya devam ediyor.

### Yönetim arayüzü Faz 3

Faz 1 ortak katmanı, Faz 2 vitrini kurmuştu; yönetim ekranları hâlâ kendi
Tailwind sınıflarını taşıyordu. Aynı tablo bir ekranda `text-sm`, diğerinde
`text-xs`; iki ekranda iki farklı "seçili sekme" rengi.

- Paylaşılan dile üç bileşen eklendi: `Table/THead/TBody/Th/Td/TableEmpty`
  (tablo `<table>` olarak kalıyor, yalnızca sınıflar tek yerde), `Tabs` ve
  `Modal` (Escape + zemine tıklama ile kapanıyor).
- Taşınan ekranlar: çek & senet portföyü, döviz kurları, hedefler, bakım işleri,
  etiket tasarımcısı, hazır raporlar, ürün görsel seçici, kullanıcı yöneticisi.
- Yönetim tarafı **nötr** dilde kalıyor — vitrin kimliği buraya uygulanmıyor.

## 42. Rota Testleri (Adım 47)

Adım 13'ten beri bütün testler `packages/services` içindeydi: domain matematiği
ölçülüyordu, onu dışarı açan **119 rota işleyicisinin hiçbiri** ölçülmüyordu.
Kırılan bir yetki sınırı ancak elle fark ediliyordu.

`apps/web/test` altında ikinci bir takım var artık — **107 test / 6 dosya**.

### Nasıl çalışıyor

- Testler rota modülünün dışa verdiği `GET`/`POST`/`PATCH` fonksiyonunu
  **doğrudan** çağırıyor; Next.js'in çağırdığı fonksiyonun aynısı. Ayakta bir
  sunucu yok, veritabanı gerçek.
- Sahte olan yalnızca iki şey (`test/setup.ts`):
  - `next/headers` — çerçevenin açtığı istek kapsamı testte `callRoute()`
    tarafından açılıyor (`AsyncLocalStorage`).
  - Auth.js çerez oturumu — çerezi okumak için ayakta bir sunucu gerekiyor.
    Bu sahte, çerezin **iddiasını** testin belirlemesine izin veriyor: SUPER_ADMIN
    yazan bir çereze karşı muhafızın satırdan cevap verdiği böyle doğrulanıyor.
- Geri kalan her şey gerçek: mobil jeton gerçek imzayla üretilip gerçek
  doğrulayıcıdan geçiyor, `checkPrincipal` satırı okuyor, izinler satırdan
  geliyor, servisler ve Prisma olduğu gibi çalışıyor.
- `react`'in `cache`'i shim'leniyor — o API React'in canary kanalında, workspace
  ise 18.2.0'a sabitli. Kaybedilen tek şey istek başına sorgu tekilleştirmesi.
- Her dosya kendi fixture'ını kuruyor (`Fixtures` sınıfı) ve **kendi yarattığı
  satırları siliyor**; seed verisi olan bir veritabanında güvenle koşuyor.

### Ne doğrulanıyor

| Dosya | Kapsam |
|-------|--------|
| `guard.test.ts` (18) | Kimliksiz istek; bozuk, başka anahtarla imzalanmış, başka issuer'lı jeton; silinmiş / pasif / sürümü geçmiş hesap; çerezin rolü, firması ve tokenVersion'ı yerine satırın okunması; izin reddinin eksik izni söylemesi; süper adminin izin kapısından muaf olmaması; rol reddi ile izin reddinin ayrı kaydedilmesi; "en az biri" izin kapısı |
| `route-scope.test.ts` (27) | Plasiyerin portföy sınırı (katalog, sepet, sipariş listesi, ekstre); bayi kullanıcısının kendi firmasına çivilenmesi — sorgu dizesinde **ve** JSON gövdede; firması olmayan hesap; kuryenin firma ekranlarına kapalı olması; saha parasının yalnız sahaya açık olması; yalnız süper admine açık uçlar; kullanıcı yönetiminin iki rolde iki ayrı kapsamı |
| `order-flow.test.ts` (20) | Fiyatın sunucuda hesaplanması, alıcının navlun ve vade uyduramaması; onay akışı (kimin onaylayabildiği, ikinci onayın rolüne göre 403 mü 409 mu); iptalde stoğun geri gelmesi ve cari borcun ters kayıtla kapanması; sipariş verilince sepetin boşalması |
| `field-money.test.ts` (13) | Tahsilatın bakiyeyi düşürmesi; tekrar anahtarının ikinci kaydı engellemesi; iptalin ters kayıt yazması ve iki kez yapılamaması; ziyaretin kaynağının **taşıdığı kimlikten** belirlenmesi (telefon → MOBILE, tarayıcı → WEB); başkasının ziyaretinin kapatılamaması |
| `account-admin.test.ts` (14) | Mobil giriş: jeton üretimi, yanlış şifre ile bilinmeyen e-postanın aynı cevabı vermesi, pasif hesap, sayaç; yetki devrinin kendinden büyük olamaması; kendini kilitleme korumaları; yetkisi kısılan hesabın elindeki jetonun bir sonraki istekte ölmesi |
| `reports.test.ts` (15) | Kayıt defterinde olmayan alanın sütunda/süzgeçte/gruplamada reddi; satır kapsamının kullanıcının süzgecinden sonra eklenmesi; paylaşılan raporun **koşanın** kapsamıyla çalışması; paylaşılmayan raporun kimliği bilinse bile koşmaması |

### İki paket aynı veritabanını paylaşıyor

`turbo run test` iki paketi paralel koşturuyordu ve ikisi de sipariş numarasını
aynı `DocumentSeries` sayacından alıyor — koşuların kabaca yarısı böyle
kırıldı. `turbo.json`'da `web#test` artık `@repo/services#test`'i bekliyor.

## 43. Web Portal (`apps/web`)

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
| `/admin/surum` | süper admin (`system.update`) | Çalışan sürüm, kanalın yayımladığı sürüm, son güncelleme sonucu — salt okunur |
| `/hesabim` | 4 rol | Kendi profili, güvenlik durumu (son giriş + IP, şifre tarihi), şifre değiştirme, kendi hareketleri |
| `/rep` | plasiyer, süper admin | Portföy alacakları, vadesi geçenler, son 30 günün en iyileri, her firmadan **Sipariş · Tahsilat · Ziyaret** |
| `/rep/tahsilat` | plasiyer, süper admin | Tahsilat girişi (onay adımlı), firmanın tahsilat geçmişi, satır bazında iptal |
| `/rep/ziyaret` | plasiyer, süper admin | Açık ziyaret + kapatma, yeni ziyaret (not + konum), ziyaret geçmişi |
| `/403` | — | Yetkisiz erişim sayfası |

## 44. Mobil Uygulama (`apps/mobile`)

- Expo SDK 51, React Navigation (native stack), TanStack Query, Zustand, NativeWind.
- **Token cihaz keychain'inde** (expo-secure-store); açılışta `/api/mobile/me` ile doğrulanır, süresi dolmuşsa silinir.
- **Oturum ortada ölebilir:** hesap pasife alınır, rolü değişir ya da şifresi sıfırlanırsa jeton hâlâ imzalı ve süresi dolmamış olduğu için cihaz bunu kendi başına anlayamaz. İlk 401 (`SESSION_REVOKED` / `ACCOUNT_DISABLED` / `ACCOUNT_MISSING`) jetonu keychain'den siliyor ve giriş ekranına sebebini yazarak dönüyor.
- **Gezinme role ve izne göre kuruluyor (Adım 45).** Yığına yalnızca kişinin gerçekten kullanabileceği ekranlar giriyor: `visits.manage` yoksa ziyaret ekranı, `cash.manage` yoksa tahsilat ekranı hiç yok. Sebep: her seferinde 403 dönen bir düğme kimseye bir şey öğretmiyor. Üç giriş noktası var — kurye teslimata, saha portföye, alıcı kendi firmasına düşer.
- **Plasiyer akışı:** Müşterilerim (portföy, arama, bakiye + kullanılabilir limit; üstte ziyaret planı / hedefler / siparişler kısayolları) → Firma → Katalog / Sepet / Siparişler / Ekstre / Ziyaret / Tahsilat.
- **Firma kullanıcısı akışı:** doğrudan kendi firmasına düşer, saha ekranları gizlidir.
- **Kurye akışı (Adım 45):** tek ekran — teslimat listesi. Katalog, sepet ve cari bilerek yok.
- **Firma ekranı:** duyurular (sunucuda gruba göre süzülmüş), cari özet, ve yetkiye göre açılan bölüm düğmeleri.
- **Katalog:** firmaya çözülmüş fiyat, iskontolu fiyat üstü çizili gösterim, stok/koli/min bilgisi, stoksuz ve fiyatsız varyant sipariş edilemez. Adım 45'te **kategori süzgeci**, ürün görseli, SKU/barkod araması, liste para birimi notu (`≈ 12,50 USD`) ve "sepette N adet" bilgisi eklendi.
- **Sepet artık sunucuda (Adım 45).** Satırlar `GET/PUT/DELETE /api/cart` ve `POST /api/cart/items` ile taşınıyor — telefonda kurulan sepet masaüstünde duruyor, uygulama kapanınca kaybolmuyor. Toplam da sunucudan (`POST /api/orders/quote`): kampanyalar, hediyeler ve KDV cihazda değil sunucuda hesaplanıyor. Adet düğmeleri koli katına yuvarlıyor; bu **rehber**, kapı değil — asıl kontrol siparişte sunucuda.
- **Sipariş aksiyonları (Adım 45):** onayla / reddet / iptal et / sevkiyat durumu. Hangi düğmenin çıkacağına cihaz karar vermiyor — sunucudan gelen `availableTransitions` ve oturumun `orders.approve` izni belirliyor, uç aynı kontrolü tekrar yapıyor. Onay için hem rol (alıcı firma yöneticisi ya da süper admin) hem izin gerekiyor.
- **Ziyaret (check-in):** GPS koordinatlı açılış, not, kapatma; geçmiş ziyaret listesi. **Konum best-effort** — izin reddedilse veya alınamasa bile ziyaret konumsuz kaydedilir, plasiyer bloklanmaz. Kayıtlar `MOBILE` damgasıyla yazılır (Adım 23) ve açık ziyaret varken yenisi açılamaz.
- **Ziyaret planı (Adım 45):** bayinin açtığı çağrılar, günün sırası, elle taşıma, "güne al" / "ziyaret edildi", tek durak yol tarifi ve **tüm durakları sırayla açan rota**. Sıra sunucuda tutuluyor (`VisitRequest.sortIndex`), cihazda değil: plasiyer sabah masaüstünde plan yapıp gün içinde telefondan bakıyor.
- **Hedeflerim (Adım 45):** ziyaret/ciro karnesi. Gerçekleşen ve **geçen süre** iki ayrı çubuk olarak yan yana çiziliyor — yüzde tek başına yalan söyler, ayın ilk günü %10 iyidir, son günü felakettir.
- **Teslimat / kurye masası (Adım 45):** kendi işleri, yol tarifi, telefonla arama, teslim formu ve **imzalı belgenin kamerayla çekilip yüklenmesi** (`POST /api/deliveries/uploads`). Fotoğraf zorunlu değil — bazı teslimatlarda kâğıt hiç imzalanmıyor ve zorunlu alan kuryeyi sahte kayıt girmeye iter; "kim teslim aldı" ise zorunlu. Sevkiyatı yönetene (`orders.fulfil`) ayrıca kurye atama çıkıyor.
- **Tahsilat:** tutar (virgüllü klavye desteği), **tahsilat şekli** (nakit/havale/çek/senet/kart/diğer — Adım 23'te siparişin ödeme yönteminden ayrıldı), açıklama; sonuç bakiyesi sunucudan döner. Adım 45'te **kasa/banka hesabı seçimi** (boş = varsayılan kasa), **çek/senet künyesi** (banka, seri, keşideci, vade — hepsi opsiyonel; sahada tutar yeter, gerisi ofiste tamamlanır), **tekrar anahtarı** (şebeke koptuğunda ikinci tahsilat yazılmaz) ve o cariye giren son tahsilatların listesi eklendi.
- **Sipariş detayı:** kalemler, toplamlar, sevkiyat adresi, kargo/takip bilgisi, durum geçmişi ve yetkiye göre işlem düğmeleri.
- **Cari ekstre:** limit/borç/alacak/bakiye özeti, yaşlandırma kovaları ve hareket listesi (telefonda okunaklı olsun diye en yeniden eskiye). Tahsilat ve sipariş sonrası kendini tazeler. Salt okunur.
- **Hesabım (Adım 45):** ad/telefon düzenleme ve şifre değiştirme. Şifre değişimi profil kaydından ayrı bir uç: bir şifrenin profil kaydetmenin yan etkisi olarak değişmesi kimsenin beklediği şey değil. Başarılı olunca sunucu tüm oturumları iptal ettiği için ekran kullanıcıyı giriş ekranına geri gönderiyor.
- **Sunucu adresi cihaz ayarı (Adım 48).** Adres derlemeye gömülmüyor: giriş ekranından ve Hesabım'dan değiştirilebiliyor, cihazda saklanıyor (`src/lib/server-url.ts`). Sebep pratik — ev bağlantısı yeni adres veriyor, tünel her açılışta yeni ad veriyor ve ikisi de yeni APK derlemeye değmez. Kaydetmeden önce `/api/health` yoklanıyor ki "yanlış adres" ile "sunucu kapalı" birbirine benzemesin; sorun bildiren (503) bir sunucu **kabul ediliyor**, çünkü eksik `tenant.json` yüzünden çalışan bir geliştirme makinesine bağlanmak engellenmemeli. Sunucuya hiç ulaşamayan bir giriş denemesi paneli kendiliğinden açıyor.
- **Uzaktan güncelleme — OTA (Adım 48).** Uygulama Play Store'dan dağıtılmadığı için her düzeltme elden APK kurmak demekti; `expo-updates` açılışta JS paketini yeniliyor, Hesabım ekranı hangi paketin koştuğunu gösteriyor ve elle denetim yaptırıyor. İnen güncelleme **kullanıcı yeniden başlatana kadar bekliyor** — yarım kalmış bir tahsilat ekranının altından uygulamayı çekmemek için. Sınır kodda yazılı: yalnızca JS ve varlıklar bu yoldan gider, yeni bir native kütüphane `runtimeVersion`'ı değiştirir ve yeni APK gerektirir.
- Türkçe para/tarih biçimlendirme, açık + koyu tema.
- **Android emülatöründe koşturuldu (Adım 45).** Giriş → portföy → ziyaret planı → katalog → sepet → sipariş → sipariş detayı → hesap → çıkış akışı canlı API'ye karşı çalıştırıldı; sipariş `ORD-20260808-0001` olarak oluştu ve cari bakiye anında güncellendi.

### APK üretimi ve dağıtımı (Adım 48)

Uygulama **Play Store'a girmiyor**: APK dosyası elden kuruluyor. Bu iki şeyi
zorunlu kıldı.

**İmza anahtarı.** Android bir uygulamayı imzalayan anahtarla tanır; anahtar
değişirse telefon güncellemeyi başka bir uygulama sayar ve kurulumu reddeder —
kullanıcının önce mevcut uygulamayı (ve onunla birlikte oturumunu, sunucu
ayarını) silmesi gerekir. Expo şablonu release'i **debug** anahtarıyla imzalıyor:
şifresi herkesçe bilinen, depoda duran bir anahtar. `plugins/withReleaseSigning.js`
bunu gerçek bir anahtarla değiştiriyor; anahtarın yolu ve şifreleri ortam
değişkenlerinden geliyor, hiçbiri depoda değil. Anahtar yoksa debug'a düşülüyor
(o APK dağıtılamaz ama denemek için derlenir).

Eklenti olmak zorunda, çünkü `expo prebuild` `android/` klasörünü her seferinde
baştan üretiyor — build.gradle'a elle yapılan düzenleme bir sonraki üretimde
siliniyor. Aynı sebeple `plugins/withGradleWrapper.js` var: şablon Gradle'ı
`-all` dağıtımıyla (~220 MB) ve **10 saniyelik** okuma zaman aşımıyla indirmeye
çalışıyor, yavaş bir hatta ilk derleme bu yüzden düşüyor ve hata derlemeyle
ilgiliymiş gibi görünüyor.

**Yerel derleme betiği** `scripts/build-apk.sh` yazıldı: Android Studio'nun kendi
JDK'sını buluyor (sistemdeki Java 26 Gradle 8.8'i kırıyor, JDK 17-21 gerekiyor),
SDK yolunu kuruyor, prebuild + `assembleRelease` koşuyor. Sunucu adresi `API_URL`
ile veriliyor ama bu yalnızca **ilk açılıştaki öneri** — kullanıcı uygulamadan
değiştirebiliyor.

**Ama bu makinede yerel derleme tamamlanamadı.** Sırayla üç engel aşıldı (Gradle
indirme zaman aşımı, yanlış JDK, yarım kalmış `android-34` kurulumu) ve dördüncüsü
aşılamadı: `expo-updates`'in Room işlemcisi SQLite'ın native kütüphanesini
`java.io.tmpdir`'e açıyor, o da bu ortamda `C:\WINDOWS` olarak çözülüyor ve yazma
reddediliyor. Geçici dizin `org.gradle.jvmargs`, `kotlin.daemon.jvmargs` ve
`kapt.workers.isolation=none` ile üç ayrı yerden verildi; kapt yine kendi
sürecinde koşup yok saydı. Betik ve eklentiler duruyor — başka bir makinede ya da
ortam düzeltildiğinde çalışacak durumda.

**Kullanılan yol: EAS Build (bulut).** Windows araç zincirini tamamen atlıyor ve
zaten OTA için gereken Expo hesabından başkasını istemiyor. `eas.json`'daki
`preview` profili APK üretiyor. Bulut derleyici bir kilit değil, kiralık bir
Linux makinesi: üstünde koşan şey aynı `expo prebuild` + `gradlew assembleRelease`.
Aynısı WSL2'de `eas build --local` ile, bir CI koşucusunda ya da ortam
düzeltildiğinde bu makinede çalışır.

```
apps/mobile  →  eas build -p android --profile preview  →  .apk indirme bağlantısı
```

**İlk APK üretildi (2026-08-10):** sürüm 1.0.0, versionCode 1, kanal `preview`,
71 MB. Proje `@saidbayraktar/b2b-mobile`.

**İmza anahtarını EAS saklıyor.** Bulut derlemesinde anahtarı EAS üretti ve
hesapta tutuyor; sonraki derlemeler aynısını kullanıyor, yani güncelleme APK'ları
telefona sorunsuz kuruluyor. Bu yüzden `withReleaseSigning` **`EAS_BUILD` ortam
değişkeni varken hiçbir şey yapmıyor**: release imza bloğunu EAS de yazıyor,
ikimiz birden yazarsak bizimki ortam değişkeni bulamayıp debug anahtarına düşer
ve derleme dağıtılamayacak bir APK üretir. Yerel derlemede eklenti eskisi gibi
çalışmaya devam ediyor. Yerel anahtar (`apps/mobile/android-signing/`) duruyor ve
gerekirse `eas credentials` ile buluta yüklenebilir.

**Güncelleme yolu ikiye ayrılıyor:** JS değişiklikleri `eas update` ile uzaktan
iniyor, yeni APK yalnızca native bir kütüphane eklendiğinde gerekiyor.

### Barkod / QR okuyucu (Adım 49)

`src/components/BarcodeScanner.tsx` — kamerayı açan tek bileşen, iki yerde
kullanılıyor.

**Katalogda:** okutulan barkod aramaya yazılıyor ve **birebir eşleşme varsa**
ürün doğrudan sepete giriyor (koli katına yuvarlanmış açılış adediyle). Birebir
şartı bilerek: sunucu araması `contains` çalıştığı için bir barkod ürün adına ya
da SKU'ya da denk gelebiliyor, ve öyle bir eşleşmeye dayanarak sipariş satırı
açmak plasiyerin okuttuğunu sandığı şeyle sepete gireni ayırır. Eşleşme yoksa
liste süzülmüş halde bırakılıyor, seçim insana kalıyor. Açık kategori süzgeci de
temizleniyor — yoksa okutulan ürün "bulunamadı" gibi görünürdü.

**Teslimatta:** sevkiyat etiketi okutulunca liste tek işe iniyor. Hem sipariş
numarası hem sevkiyat belge numarası eşleştiriliyor; etiket tasarımcısında
hangisinin basıldığı müşteriye göre değişiyor.

Okunan biçimler sayılı (EAN-13/8, UPC-A/E, Code128, Code39, ITF-14, QR): kamera
ne kadar az biçim denerse o kadar hızlı kilitleniyor. İlk okumadan sonra dinleme
kapanıyor — kamera aynı barkodu saniyede onlarca kez bildiriyor ve bu, tek
okutmayla üç koli sipariş etmek demekti. Kamera izni katman açılınca isteniyor,
uygulama açılışında değil.

### Push bildirim (Adım 49)

Taşıyıcı Expo'nun push servisi; uygulama zaten Expo ile derlendiği için jetonu o
üretiyor ve FCM anahtarı/sertifika döngüsü bizde durmuyor.

| Olay | Kime | Neden ona |
|------|------|-----------|
| Yeni sipariş (onay bekliyor) | Firma yöneticileri | Onay onların işi |
| Yeni sipariş (canlı) | Plasiyer | Kendi müşterisinin hareketi |
| Sipariş durum değişimi | Siparişi giren + firma yöneticileri | Bekledikleri cevap |
| Ziyaret çağrısı açıldı | Portföy temsilcisi | Çağrı ona düşüyor |
| Teslimat ataması | Atanan kurye | Ekranı sürekli açık tutmuyor |

İşi **yapan kişiye** bildirim gitmiyor: kendi girdiğin siparişi sana duyuran bir
uygulama, bir hafta içinde bildirimleri kapattırır.

**Jeton tek kullanıcıya ait** (`PushDevice.token` tekil) ve **taşınabilir**: aynı
telefondan başka biri giriş yaparsa satır yeni kullanıcıya geçiyor. Eski sahipte
kalsaydı, cihazı devralan kişi öncekinin sipariş ve tahsilat bildirimlerini
okumaya devam ederdi. Sahip her zaman **oturumdan** okunuyor, istekten değil.
Çıkışta cihaz çözülüyor — jeton silinmeden önce, çünkü çözme isteği oturumla
yetkileniyor.

Gönderim e-posta bildirimleriyle aynı iki kuralı izliyor: hiçbir zaman
fırlatmıyor ve işlem dışında çağrılıyor. Expo "DeviceNotRegistered" dediğinde
satır kapatılıyor (silinmiyor: aynı cihaz geri geldiğinde kime ait olduğu
bilinsin). 8 rota testi bu sınırları koruyor.

### Çevrimdışı çalışma (Adım 49)

Üç ayrı davranış, üçü de bilerek farklı:

- **Okuma** — son görülen veri diske yazılıyor (`AsyncStorage`, bir hafta), şebeke
  yokken ekranlar boş değil eski veriyle açılıyor. Stok yarım saat önceki sayı
  olabilir; bu gizlenmiyor, üstte turuncu bir şerit "çevrimdışı" yazıyor.
- **Saha yazmaları (tahsilat, ziyaret aç/kapat, teslim onayı)** — kuyruğa
  alınıyor, şebeke gelince kendiliğinden gidiyor, uygulama kapanıp açılsa bile
  duruyor. Üçü de *olmuş bir şeyin kaydı*: para alındı, kapıya gidildi, mal
  teslim edildi. On dakika geç düşmesi işi bozmuyor, hiç düşmemesi bozuyor.
  Tahsilatın kuyruğa girebilmesinin sebebi Adım 43'teki **tekrar anahtarı**:
  kuyruk aynı kaydı iki kez gönderse de sunucu ikincisini yazmıyor.
- **Sipariş — kuyruğa alınmıyor.** Fiyat, kampanya, stok ve limit sunucuda
  çözülüyor; çevrimdışı yazılan bir sipariş gönderildiği anda başka bir fiyata ya
  da tükenmiş stoğa denk gelebilir ve müşteriye okunan tutar tutmaz. Sepet zaten
  sunucuda, kaybolmuyor.

Şebeke durumu NetInfo'dan geliyor ve `isInternetReachable` de bakılıyor: Wi-Fi'ye
bağlı ama internete çıkamayan bir telefon (otel ağı, kotası bitmiş hat) NetInfo'ya
"bağlı" görünüyor.

Tahsilat ekranı duraklamayı bir sonuç sayıyor: çevrimdışı gönderilen tahsilatta
`onSuccess` hiç çalışmıyor, ekran dönen bir düğmeyle açık kalırdı ve plasiyer
parayı aldığı hâlde kaydın gidip gitmediğini bilemezdi. Ekran kapanıyor, şeritte
"N kayıt bekliyor" yazıyor.

**Çıkışta disk önbelleği siliniyor** — içinde müşteri listesi, cari bakiye ve
sipariş tutarları var; hesap değişince veri de değişmeli.

### Kayıt kimliği doğrulaması (Adım 45'te düzeltildi)

Ürün, varyant ve kategori kimlikleri `z.string().cuid()` ile doğrulanıyordu.
`cuid()` yalnızca Prisma'nın `@default(cuid())` ile ürettiği kimliği kabul eder;
oysa gerçek katalog dışarıdan içe aktarıldığında kimlik başka yerde üretiliyor.
Sonuç somut: **2.657 varyantın 2.654'ü** sepete eklenemiyor ve sipariş
edilemiyordu — `POST /api/cart/items` ve `POST /api/orders` bu satırlar için
`Invalid cuid` diyerek 400 dönüyordu. Katalogda görünen ama satılamayan bir
ürün demek bu, ve hem webde hem mobilde aynıydı.

Yerine `entityIdSchema` (`packages/types/src/id.ts`) geldi: boş olmayan, en çok
64 karakter, `[A-Za-z0-9_-]` kümesinde bir dize. Gevşetme güvenlik açığı değil,
çünkü `cuid()` hiçbir zaman yetki kontrolü değildi — kimliğin sahibi olup
olmadığımız her zaman veritabanı aramasıyla belirleniyor (yoksa 404,
başkasınınsa 403). Buradaki kontrolün tek işi çöp girdiyi ucuza elemek.

Diğer 43 `.cuid()` kullanımı **bilerek** dokunulmadan bırakıldı: hepsi
uygulamanın kendi oluşturduğu satırları (sipariş, adres, kullanıcı, kampanya)
adlandırıyor ve oralarda kimlik her zaman Prisma'dan geliyor. İçe aktarma ya da
ERP eşlemesi o tablolara da uzanırsa aynı değişiklik oralarda da gerekecek.

## 45. Merkezden Güncelleme (Adım 50)

Adım 40 dağıtımı çözdü ama her sunucu kendi `update.sh`'ını bekliyordu: elli
kurulum, elli el hareketi ve "hangi müşteri hangi sürümde" sorusuna cevap yok.
Bu adım güncellemeyi merkezden **duyurulabilir** hâle getiriyor. Ayrıntı:
`DEPLOYMENT.md` bölüm 5b.

### Merkez bir sunucu değil, bir dosya

Akış statik bir JSON (`<UPDATE_FEED_URL>/<kanal>.json`) ve yön tek taraflı:
**kurulumlar okur, merkez hiçbir sunucuya bağlanmaz.** Müşteri sunucularına
komut geçirebilen merkezî bir kontrol paneli, ele geçirildiğinde elli kurulumda
birden kod çalıştırma imkânı olurdu — bu ürün için kabul edilemeyecek bir tek
hata noktası.

Akış **yalnızca bir git etiketinin adını** söyler; kod her zaman kurulumun kendi
`origin`'inden gelir. Akış adresini ele geçirmek kod çalıştırmaya yetmez,
saldırganın ayrıca depoya yazabiliyor olması gerekir. İki kilit daha: etiket adı
`^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$` süzgecinden geçmeden `git`e verilmez (o dize
kabuğa da giriyor), ve `UPDATE_REQUIRE_SIGNED_TAG=1` ile etiketin GPG imzası
doğrulanır.

Akış dosyası kanal başına ayrı ve **düz**: iç içe JSON yok, çünkü müşteri
sunucusunda `jq` olduğunu varsayamayız. Ajanın bağımlılığı `sh` + `git` +
`docker`. Bunun bedeli `notes` alanının tırnak ve satır sonu içerememesi;
`release.sh` bunu yayımlarken reddediyor, uzun metin `notesUrl`de duruyor.

### Ajan: ne zaman dokunur, ne zaman durur

`scripts/agent.sh` zamanlayıcıdan günde dört kez koşuyor
(`deploy/b2b-update.timer`). Bakmak ile uygulamak ayrı: sürüm bilgisi gün içinde
tazeleniyor, güncelleme yalnızca bakım penceresinde uygulanıyor. Ekranda "üç
gündür bakılmadı" yazan bir kurulum, penceresi gecede olduğu için öyle
görünmemeli.

| Politika | Ne yapar |
|---|---|
| `off` | Akışa bakmaz |
| `notify` | Bakar, ekranda gösterir, **dokunmaz** — varsayılan |
| `auto` | Bakım penceresinde kendisi günceller |

Varsayılan bilerek `notify`. Müşterinin ERP'ye bağlı sipariş sistemini haberi
olmadan yeniden başlatan bir yazılım, kazandığından çok güven kaybettirir.

`auto` politikasında bile uygulamadan önce üç şart aranıyor:

1. **Bakım penceresi** içinde olunmalı (sunucunun yerel saati).
2. **Kurulum sağlıklı** olmalı. Yarım kalmış bir göçün üstüne yeni sürüm koymak
   teşhisi imkânsız hâle getirir; operatör önce neden bozuk olduğunu görmeli.
3. **Çalışma ağacı temiz** olmalı. Sunucuda elle düzenlenmiş bir dosya varsa
   `git checkout` onu ezerdi ve kaybolanın ne olduğunu kimse bilemezdi.

Uygulama işini ajan yapmıyor, `update.sh`'a devrediyor: yedek → derle → göç →
geçir → sağlığı bekle → tutmazsa geri al. Ajanın eklediği tek şey, betik
"başarılı" dönse bile çalışan sürümü tekrar okuyup beklenen sürüm olduğunu
doğrulaması — sessizce güncellenmemiş bir kurulum, bilinen en sinsi arıza.

### Sürüm artık etiket adı

`update.sh` sürümü `git rev-parse --short HEAD` yerine `git describe --tags
--always --dirty` ile üretiyor. Zorunluydu: akış sürümü `v1.4.0` diye duyuruyor,
kurulum kendini kısa sha ile tanıtsaydı iki ad hiçbir zaman eşleşmez, her
kontrolde "güncelleme var" denirdi.

Aynı kodu tekrar yayına almak için kullanılan "sürüme zaman soneki ekle" numarası
da kaldırıldı; yerine `--force-recreate` geldi. **Sürüm adı kodun kimliğidir,
çalıştırma sayısının değil.**

### Sürüm ekranı — ve neden düğme yok

`/admin/surum` (izin: `system.update`, yalnızca satıcı tarafı) çalışan sürümü,
kanalın yayımladığını, son kontrol zamanını ve son güncelleme denemesinin
sonucunu gösteriyor. Salt okunur ve bilerek öyle: web bir kapsayıcının içinde,
orada `git` de `docker` da yok. Erişebilsin diye docker soketi kapsayıcıya
bağlansaydı, uygulamada bulunacak herhangi bir açık **host'ta root'a** çıkardı.
Bir "Güncelle" düğmesinin bedeli budur.

Ekran akışa kendi bakmıyor, ajanın bıraktığı durum dosyasını okuyor:
güncellemeyi uygulayacak olanın gördüğü şey neyse ekranda o yazmalı.

**En önemli durum `stale`.** Ajan ölmüşse dosya son baktığı anı anlatmaya devam
eder; "güncelsiniz" cevabı üç haftadır akışa bakmamış bir kurulumda yanlıştır.
36 saatten eski kontrol "ajan susuyor" olarak gösteriliyor. Düşen güncelleme de
bekleyen güncellemenin önüne geçiyor: ikisi aynı anda doğrudur ve operatörün
önce görmesi gereken, tekrar denemeden önce neyin düştüğü.

### Durum dosyası: dizin bağlanır, dosya değil

Ajan durumu geçici ada yazıp taşıyarak güncelliyor — web yarısı yazılmış bir
JSON okumasın diye. Bu yüzden Compose'da bağlanan şey **dizin**
(`UPDATE_STATE_DIR` → `/data/state:ro`): bind ile bağlanan tek bir *dosya* eski
inode'a takılı kalır ve taşımadan sonra bir daha hiç değişmez. Ekran ilk günün
verisini sonsuza kadar gösterirdi.

Okuma tarafı hiçbir bozuklukta atmıyor: dosya yoksa, yarım yazılmışsa ya da
şema tutmuyorsa `null` → ekran "bilinmiyor" diyor. Sürüm ekranının kendisi, bir
sürüm dosyası bozuk diye 500 vermemeli.

### Doğrulama

15 birim testi (`update-channel.test.ts`) durum çıkarımını ve bozuk dosya
yollarını tutuyor. Ayrıca ajan **canlı çalıştırıldı**: sahte bir akış sunucusuna
karşı ürettiği durum dosyası Zod şemasıyla okundu (bash'in yazdığı JSON ile TS'in
beklediği şema arasındaki dikiş, kırılmaya en açık yer), `v1.4.0; rm -rf /`
sürüm adının reddedildiği ve akışa ulaşılamadığında hatanın dosyaya yazıldığı
görüldü. `release.sh`'ın üç kapısı da denendi: geçersiz ad, depoda olmayan
etiket, `origin`'e gönderilmemiş etiket.

### Kapanmayan

**Filo görünümü yok.** "Hangi müşteri hangi sürümde" sorusunu tek ekranda
cevaplayan merkezî bir liste için kurulumların merkeze rapor vermesi gerekir —
yani merkezin bir sunucuya dönüşmesi ve her kurulumdan gelen isteği
kimliklendirmesi. Akışın tek yönlü kalması bilinçli tercih; filo görünümü ayrı
bir iş.

## 46. Stok Hareket Defteri (Adım 51)

Adım 39 depoyu ve `VariantStock` kırılımını getirmişti, ama eldeki adet hâlâ tek
bir sayıydı: `ProductVariant.stock`. O sayının **nasıl** o sayı olduğunu hiçbir
yer söylemiyordu — sipariş düşürüyordu, ERP senkronu üstüne yazıyordu, elle
düzeltme onu da eziyordu, üçü de iz bırakmıyordu. Sayım tutmadığında bakılacak
bir yer yoktu.

Bu adım kasa defterinin (Adım 27) stok karşılığını kuruyor: `StockMovement`.

### Eldeki adet artık defterin bakiyesi

Stoku değiştiren **tek kapı** `postStockMovement`. Buradan geçmeyen her yazma
defteri yalancı yapar, bu yüzden siparişteki `stock: { decrement }` çağrıları da,
iptaldeki `restock()` da, ERP senkronundaki üstüne yazma da kaldırıldı — hepsi
artık defterden geçiyor.

İki kural kasadan geliyor:

- **Ekle-only.** Yanlış kayıt silinmez; kendisine bağlı ters kayıtla düzeltilir.
  `reversalOfId` benzersiz, yani aynı hareketin iki kez iptal edilmesini
  veritabanı durdurur.
- **Bakiye ile hareket aynı işlemde yazılır.** `postStockMovement` kendi işlemini
  açmaz, dışarıdan alır: geri alınan bir siparişten sağ çıkan stok hareketi hiç
  hareket olmamasından kötüdür.

Üçüncü kural bu deftere özel: **toplam da defterin bakiyesi.** Daha önce
`ProductVariant.stock` depo kırılımının toplamı olarak yeniden hesaplanıyordu; bu,
depo bilmeyen sipariş düşüşlerini ilk ERP senkronunda siliyordu. Artık her iki
sayı da aynı hareketin farkı kadar oynuyor: depo adı verilmişse kırılım da, her
hâlde toplam da.

Yazma `increment`/`decrement` ile yapılıyor, oku-sonra-yaz ile değil: iki
eşzamanlı siparişin aynı varyantı okuyup aynı sonucu yazması (lost update) böyle
imkânsız. `balanceAfter` satırdan geri okunuyor, dolayısıyla gerçekten *o
hareketten sonraki* bakiye.

### Altı sebep

| Kaynak | Ne zaman | Kim yazar |
|--------|----------|-----------|
| `ORDER` | Sipariş **oluşturulduğunda** — sevkte değil | `order.ts` |
| `ORDER_CANCEL` | İptal ve ret malı geri verir | `order-lifecycle.ts`, `order-approval.ts` |
| `MANUAL` | Fire, numune, hurda, bulunan fazla mal | `/admin/stok` |
| `COUNT` | Sayım farkı | `/admin/stok` |
| `TRANSFER` | Depolar arası aktarım (iki bacak) | `/admin/stok` |
| `ERP` | Gecelik senkronun farkı | ERP ajanı |

Sipariş **girildiği anda** düşüyor: satılabilir adet bu sistemde "sipariş
edilmemiş olan"dır, yoksa aynı son kutu iki müşteriye satılırdı. Hareket sipariş
satırından *sonra* yazılıyor ki `orderId`'yi taşıyabilsin — en büyük kaynağı
isimsiz "ORDER" olan bir defter hiçbir soruyu cevaplamaz.

İptal, siparişin satırlarından okuyor; defterdeki çıkış hareketlerinden değil.
Sebebi: defter bu adımdan önce oluşmuş siparişler için boş ve o siparişlerin
iptali de malı geri vermeye devam etmek zorunda.

### ERP senkronu ezmiyor, fark yazıyor

`ingestStock` artık ERP'nin bildirdiği adede **farkı kadar hareket yazarak**
çekiyor. "Gece ERP 40 adet düşürdü" bilgisi olmadan, sabah stoku eksilmiş bulan
kişi kimin düşürdüğünü hiçbir zaman öğrenemiyordu. Fark görünür olduğu an, ERP
ile B2B'nin ayrıştığı ürünler de kendiliğinden ortaya çıkıyor.

Farkın sıfır olduğu satır hiçbir şey yazmıyor: saatlik senkron 2.600 ürünü
defterin altına gömmemeli. `erpSyncedAt` yine de her satırda tazeleniyor — onun
sorusu "bu sayı ne zaman doğrulandı", "ne zaman değişti" değil.

ERP hareketi eksi bakiyeye izin veriyor: ERP eksiye düşürüyorsa sebebi ERP'nin
işi, ve senkronu reddetmek iki defteri kalıcı olarak ayrıştırırdı.

### Eksi bakiye: kime açık, kime kapalı

- **Sipariş** açık: satış zaten stoka bakılarak kabul edilmiştir ve iki
  eşzamanlı siparişin son adedi paylaşması siparişi düşürmek için yeterli sebep
  değil — mal borcu doğar, defter de bunu eksi bakiye olarak gösterir.
- **Elle giriş ve sayım** kapalı: orada eksiye düşüren sayı bir hata, çoğu zaman
  yanlış yazılmış bir adet.
- **Aktarımın çıkış bacağı** toplam için açık, depo için kapalı. Aktarım toplamı
  değiştirmez; toplam yalnızca iki satırın yazılması arasında düşer. O aradaki
  değeri kısıt saymak, aktarımı toplamın tamamına bakan yanlış bir hatayla
  reddederdi — asıl kısıt kaynak deponun adedi.

Kırılım toplamdan **önce** kontrol ediliyor: ikisi birden yetersizse okunması
gereken hata deponunki. "Depoda yeterli mal yok" nereye bakılacağını söyler,
"stok eksiye düşerdi" söylemez.

### Sayım sayılan adedi ister, farkı sistem hesaplar

Sayım kâğıdında yazan sayı sayılan adettir. Farkı insana hesaplatmak, üstelik
defterin sayısını görünce sayımı ona uydurma eğilimini de doğuruyor. Fark tek bir
hareket olarak giriyor ("sıfırla + yeniden yükle" iki hareketi olarak değil):
sayımın anlamı defterin kaç adet yanıldığıdır ve o sayı tek satırda okunmalı.
Fark sıfırsa hiçbir şey yazılmıyor — defter "değişmedi" satırıyla şişmemeli.

### Aktarım ve ters kayıt

Aktarım iki hareket, `counterpartId` ile birbirine bağlı — kasadaki virmanla aynı
gerekçe: tek bir "aktarım" satırı, her depo ekstresini "bu satır bana göre eksi
mi artı mı" sorusunu çözmek zorunda bırakırdı. Bir bacağı iptal edildiğinde öbürü
de iptal ediliyor; aktarım tek olaydır ve yarısını geri almak öbür depoda olmayan
mal yaratırdı.

**Sipariş kaynaklı hareketler defterden iptal edilemiyor.** Onların öbür yarısı
bir sipariş satırı ve bir cari kayıt: yalnız stok bacağını geri almak siparişi
"malı çıkmamış" gösterirdi. Siparişin kendisi iptal edilir, o yol iki tarafı
birden çözer.

### Ekran ve izinler

`/admin/stok` dört panel: dönem özeti (ne girdi, ne çıktı, hangi sebeple),
stok seviyeleri (kritik stok altındakileri süzen), hareket defteri
(SKU/barkod/ürün adı arama + kaynak/yön/tarih süzgeci) ve depolar.

İki yeni izin: **`stock.view`** (defteri ve kırılımı görür) ve **`stock.manage`**
(sayım, fire girişi, aktarım, ters kayıt). İkisi de yalnız `SELLER` hesap
ailesine açık — depo satıcının deposu. Bayiye vermek "kaç adet kalmış, ne zaman
tükeniyor" bilgisini müşteriye açardı; katalogdaki "var/yok" zaten yeterli. Sahaya
da verilmiyor: plasiyerin işi malı satmak, sayım tutmak değil.

### Rapor veri kümesi: `STOCK`

Rapor tasarımcısına yedinci veri kümesi. Satış raporundan farkı, sattığımızı
değil **stoktan çıkan her şeyi** göstermesi: fire, sayım farkı ve ERP'nin
düzeltmesi siparişin yanında duruyor. "Bu ay 400 adet eridi, 310'u satış"
cevabını başka hiçbir veri kümesi veremiyor. Kapsam kasayla aynı: yalnız süper
admin.

`balanceAfter` toplanabilir bir sayı değil — bir andaki bakiye; gruplanmış bir
raporda toplamı anlamsızdır, MIN/MAX ile "dönem sonunda kaç kaldı" için duruyor.

### Doğrulama

15 entegrasyon testi (`stock-ledger.test.ts`): sipariş düşürür/iptal geri verir,
sayım farkı, aktarımın iki bacağı, ters kaydın çift iptali reddetmesi, ERP
farkının sıfırken hiçbir şey yazmaması, eksi bakiye kuralları. Toplam **509 test**
(394 servis + 115 rota).

## 47. Döviz Belgede (Adım 52)

Adım 42 dövizi hesaplatmıştı: dolarla listelenen ürün TL'ye çevriliyor, kullanılan
kur sipariş satırına donuyor. Ama o kur **hiçbir yerde basılmıyordu**. Şemadaki
yorum "belgede `100 USD × 34,2150` satırı basılacak" diyordu ve basan bir ekran
yoktu — yazılıp gösterilmeyen kur, "100 dolardan anlaşmıştık" diyen müşteriyle
yapılacak tartışmayı çözmüyor.

### Künye artık dört yerde

`CurrencyNote` tek bileşen, dört yüzeyde:

| Yer | Ne basar | Neden |
|-----|----------|-------|
| Vitrin kartı ve ürün detayı | `12,50 USD` | Müşteri hangi sayıdan çevrildiğini görür |
| Sepet satırı | `birim 12,50 USD` | Sipariş öncesi son kontrol |
| Sipariş detayı | `100,00 USD × 34,2150` | Kur artık donmuş, gösterilebilir |
| Fatura | `100,00 USD × 34,2150` | Faturayı kontrol eden çarpımı kendi yapar |

Sepette **kur yok**, ötekilerde var: sepetteki kur henüz donmadı, sipariş
verildiğinde donacak. Orada bir kur göstermek, tutulmayacak bir söz verirdi.

Kur dört ondalıkla basılıyor. İki basamağa yuvarlamak belgedeki çarpımı tutmaz
hâle getiriyor — 100 × 34,21 ile 100 × 34,2150 arasında 15 kuruş var ve faturayı
kontrol eden kişi o farkı hesap hatası sanıyor.

Not yalnızca **üçü de varsa** basılıyor (para birimi yabancı + tutar var). "USD"
yazıp sayıyı göstermemek, TL fiyatın dolar olduğu izlenimini bırakırdı.

### Fatura künyeyi kopyalamıyor, okuyor

`InvoiceItem`e üç yeni kolon eklenmedi; künye `orderItem` ilişkisinden okunuyor.
Faturanın diğer alanları (ürün adı, SKU, fiyat) anlık görüntüdür çünkü değişebilen
bir şeyi dondururlar. Kur ise **zaten dondurulmuş** bir anlık görüntü: kopyalamak
ikinci bir doğru kaynağı yaratır ve ikisinin ayrışması an meselesidir.

### Firmanın para birimi diye bir şey yok (kaldırıldı)

`Company.currency` üç harflik serbest metin bir alandı. Hiçbir hesap onu
okumuyordu — defter TL — ama **cari ekstre belgesi basıyordu**: "USD" işaretlenmiş
bir firmanın TL bakiyesi, belgede dolar diye çıkıyordu. Yönetim formundaki kutu,
bir müşteriyi dolarla faturalayabileceği izlenimi de veriyordu.

Kolon düşürüldü (`20260813120000_drop_company_currency`), formdaki alan kaldırıldı,
ekstre artık defterin para birimini basıyor. Yabancı para **liste fiyatının**
özelliğidir; firmanın değil.

### Rapor alanları

`ORDER_ITEMS` veri kümesine üç alan: liste para birimi (gruplanabilir), donmuş kur
ve döviz cinsinden liste birim fiyatı. Gruplanabilir olması asıl işi — "dolarla
satılan malın cirosu ne kadar" sorusu ancak para birimine göre kırılınca
cevaplanıyor. Kur toplanabilir bir sayı değil; süzmek ve bakmak için duruyor.

### Doğrulama

`currency.test.ts` 6 testten 10'a çıktı: sipariş detayının künyeyi taşıması, TL
satırın künye basmaması, fatura satırının siparişinkiyle **birebir** aynı olması
ve ekstrenin defterin para birimini basması. Toplam **513 test**.

## 48. Arayüz Faz 3 Kapandı (Adım 53)

Faz 3'ün kalanı "rapor tasarımcısı ve sipariş detayı" diye yazılmıştı. Sayınca
asıl kalan başka çıktı: **ortak dilde iki bileşen hiç yoktu**, ve o boşluk 19
ekranda ayrı ayrı doldurulmuştu.

### Eksik iki ilkel

- **`Checkbox`** — 19 ekranda ham `<input type="checkbox">`. Kimi etiketiyle
  `<label>` içindeydi, kimi değildi: o ekranlarda metne tıklamak kutuyu
  işaretlemiyordu. Hiçbirinde odak halkası yoktu, üçünde farklı bir marka rengi
  vardı. Yerli kutu korundu (klavye ve erişilebilirlik bedava); rengi, odak
  halkası ve etikete bağlanması tek yere alındı.
- **`LinkButton`** — beş ekranda `<Link>`e elle buton sınıfı yazılmıştı, üçü
  farklı yükseklikteydi. Eleman `<a>` kalıyor çünkü orada gerçekten gezinme var:
  `<button onClick={router.push}>` yeni sekmede açmayı, orta tıklamayı ve
  bağlantı adresini görmeyi bozardı.

Ayrıca `TextInput`/`Select`e **yoğun boy** (`size="sm"`) eklendi. Rapor
tasarımcısı gibi tek satıra beş kontrol dizen ekranlar bunu kendi sınıflarını
yazarak elde ediyordu ve ortaya **üç ayrı yükseklik** çıkmıştı (`h-7`, `h-8`,
`h-9`); ikisi seçildi, gerisi gitti.

### Rapor tasarımcısındaki kopya panel

`report-builder.tsx` dosyanın en altında **kendi `Panel` bileşenini** tanımlıyordu
ve o, paylaşılanı gölgeliyordu: aynı isim, farklı köşe yarıçapı, gölge yok.
Ekranların ayrı ayrı yazıldığını ele veren tam olarak bu tür bir kopya. Silindi;
dosya artık ortak `Panel`, `Button`, `Select`, `TextInput`, `Checkbox`,
`ErrorLine`, `LoadingState` ve `Badge` kullanıyor. Filtre satırındaki
`h-8 rounded-md border…` dizesi altı yerde tekrarlanıyordu — hepsi `size="sm"`
oldu ve her kontrol bir `aria-label` kazandı (dizili kutuların hiçbirinin adı
yoktu).

### Sipariş detayı

Durum rozetinin renkleri elle yazılmış Tailwind sınıflarıydı ve **koyu temada
hiçbiri tanımlanmamıştı**: koyu zeminde açık amber üzerine koyu amber metin
okunmuyordu. `Badge` tonlarına geçildi. Tablo, `Table/THead/Td` ilkelerine;
durum düğmeleri `Button`a taşındı — dönen simge artık yalnızca **tıklanan**
düğmede, öncesinde `isPending` hepsini birden döndürüyor ve hangisinin işlendiği
kayboluyordu.

### Süpürme

`Yükleniyor…` metni 17 ekranda elle yazılmış bir `<p>` idi; hepsi `LoadingState`
oldu (dönen simge dahil). İki yer bilerek dışarıda: teslimat ekranındaki
"Yükleniyor…" **dosya yükleme**, veri bekleme değil; firma seçicideki ise bir
`<li>` içinde ve liste anlamını bozmamalı.

## 49. Sayfa Düzeni (Adım 54)

Vitrinin hangi bloktan oluştuğu ve blokların sırası koda gömülüydü: duyuru şeridi
arama kutusunun üstündeydi çünkü JSX'te oradaydı. Bunu değiştirmek derleme ve
dağıtım istiyordu, oysa "kampanya bandını yukarı al" bir tasarım kararı.

Düzen artık **veri**: sıralı bir blok listesi (`PageLayout`, sayfa başına tek
satır).

### Kayıt defteri, üçüncü kez

Rapor tasarımcısı (Adım 9) ve kampanya motorundaki (Adım 12) kalıbın aynısı —
**kayıt defteri güvenlik sınırıdır.** Blok tipleri sunucuda tanımlı; istemciden
gelen tip asla doğrudan kullanılmıyor.

İki yön, iki farklı davranış ve bu bilinçli:

- **Yazarken tanınmayan tip reddediliyor.** Sessizce yutmak, kullanıcının
  eklediği bloğun sebebi söylenmeden kaybolması olurdu.
- **Okurken tanınmayan tip atılıyor.** Bir kurulum eski bir sürüme geri
  alındığında vitrinin açılmaya devam etmesi, o bloğun görünmesinden önemli.

Bilinmeyen ayar anahtarları atılıyor, sayılar aralığa kırpılıyor, aynı blok iki
kez konamıyor (ürün ızgarasını iki kez çizmek düzen değil, hata).

### Kaydı olmayan sayfa varsayılanla çiziliyor

Varsayılan liste, Adım 53'e kadar JSX'te duran sıranın **ta kendisi**. Göç bir
satır oluşturmuyor; yükselten kurulumda vitrin görünüş olarak hiç değişmiyor.
"Varsayılan boş liste" olsaydı ilk açılışta vitrin bomboş çıkardı.

Aynı gerekçeyle `PRODUCT_GRID` **zorunlu**: kaldırılamıyor, kapatılamıyor ve
kayıttan düşmüşse okurken geri konuyor. Ürünsüz bir vitrini yönetim ekranından
yapılabilir kılmak, kendini vurmanın kolay yolu.

### İki bölge, çünkü sayfa gerçekten öyle

Bloklar `stack` (tam genişlik: duyurular, serbest metin, arama şeridi) ve `row`
(üç sütunlu katalog satırı: kategori çubuğu, ürün ızgarası, sepet paneli) diye
ayrılıyor. Sıra her bölgenin **kendi içinde** kayıttan geliyor. Sepet panelini
duyuruların üstüne tam genişlikte bir bant olarak koyabilmek "esneklik" değil,
bozuk sayfa olurdu.

Kapatılan sütun yer kaplamıyor, kalanlar genişliyor — sabit ızgara bırakılsaydı
kapatılan kenar çubuğu yerinde bir boşluk olarak durur ve "kapanmadı" gibi
görünürdü.

### Kapatmak ≠ silmek

Kapalı blok listede duruyor, yalnızca çizilmiyor. "Kampanya bandını bu hafta
kaldır" isteğinin doğru karşılığı bu: ayarları kaybetmeden geri açmak.

### Rol değil, izin

Backlog'da "design admin **rolü**" diye yazılıydı. Yapılmadı: rol yalnızca hangi
kabuğa girileceğini belirliyor, ne yapılabileceğini izinler belirliyor (Adım 30).
Beşinci bir rol o ayrımı bozardı. Bunun yerine **`design.manage`** izni —
yalnızca `SELLER` ailesine açık, çünkü vitrin satıcının vitrini.

### Ekran

`/admin/sayfa-duzeni`: blokları sırala (↑/↓), aç/kapat, kaldır, ayarlarını
düzenle, varsayılana dön. Sürükle-bırak yok — ↑/↓ klavyeyle çalışıyor,
dokunmatikte şaşırtmıyor ve beş bloklu bir listede sürüklemekten hızlı.

Yeni blok eklemek için form yazmaya gerek yok: ayar formu kayıt defterindeki
`params` tanımından çiziliyor (metin / sayı / evet-hayır).

### Doğrulama

10 entegrasyon testi: kayıtsız sayfanın varsayılanı, tanınmayan bloğun
reddedilmesi, zorunlu bloğun korunması, ayar kırpma, sıranın geri okunması ve
**elle bozulmuş kaydın** vitrini düşürmemesi. Toplam **523 test**.

## 50. Kampanya v3: Adet Kademesi (Adım 55)

"10 alana 1 bedava, 50 alana 6 bedava" tek kampanyada kurulabiliyor. Öncesinde
bunun karşılığı üç ayrı kampanya + üç ayrı "en az N adet" koşuluydu ve **üst
üste biniyorlardı**: 100 adetlik sepet üçünü birden topluyordu. Bunu durduran
tek araç `stopFurther` ise arkasındaki **ilgisiz** kampanyaları da kesiyordu.

### Merdiven toplanmaz, basamak değiştirir

Ulaşılan **en üst** kademe geçerli. 50 adette 6 hediye demek; 1 + 6 değil, "her
10'da bir"in vereceği 5 de değil. Basamağın anlamı zaten altındaki orandan
**daha iyi** ödemesi — satıcının müşteriyi 40'tan 50'ye çıkarma aracı bu.

Sepet en üst kademenin üstüne çıkarsa kademe orada durur. "Tekrar etsin"
isteyen kişi merdiveni değil, `GIFT_ITEM`in `perMatch`ini tarif ediyordur.

### İki aksiyon, tek merdiven

- **`GIFT_TIER`** — kademeli hediye. Hediye varyantı + kademeler + hedef
  ürün/kategori. Hediyeyi motor yine **fiyatlamaz**; `GIFT_ITEM` ile aynı
  yoldan geçer (kendi değeriyle satır + eşit indirim, stoktan düşer,
  verilemiyorsa atlanır).
- **`PERCENT_OFF_TIER`** — kademeli yüzde. Sepetteki **adet** kademeye karar
  verir, indirim eşleşen satırların tamamına uygulanır. Bu boşluk gerçekti:
  `Price.minQuantity` tek satırın kendi adedine bakar, hacim iskontosu (Adım 25)
  firmanın **geçmiş cirosuna** bakar; "bu sepette bu kategoriden 50 adet var"
  diyen bir araç yoktu.

Adet sayımı hedeflenen satırlardan yapılır: sepette başka kategoriden 40 adet
daha olması kademeyi yükseltmez.

### Geri gitmeyen merdiven kuralı

Kademe satırları herhangi bir sırada girilebilir (sunucu değerlendirirken
sıralıyor), ama:

- aynı adetten iki kademe olamaz,
- üst kademe alt kademeden **az veremez**.

Geriye giden merdiven müşteriyi çok almakla cezalandırır; bunu yazan kişi değil,
müşteri fark eder. Kural hem kayıt defterinde hem de kampanya formunda —
yönetici kaydetmeden önce uyarıyı görüyor.

### Yazarken reddedilir, okurken atlanır

Kampanya motorunun eskiden beri süren davranışı burada da geçerli: elle
bozulmuş bir kademe kaydı siparişi **düşürmez**, o kampanya atlanır ve günlüğe
yazılır. Doğrulama yeri kampanya formu.

### Doğrulama

8 birim + 4 entegrasyon testi: basamak eşiği (9/10/49/50/500), kademelerin
toplanmaması, karışık sırada saklanmış kademe, hedeflenmemiş satırın sayıma
girmemesi, geri giden merdivenin reddi ve bozuk kaydın atlanması. Toplam
**535 test**.

## 51. Rapor v3: Hesaplanmış Sütun (Adım 56)

Rapor tasarımcısı topluyor ama **bölemiyordu**: "sipariş başına ortalama sepet",
"iskontonun ciroya oranı", "KDV tutarı" gibi bir sütun kurulamıyor, rapor CSV
olarak indirilip Excel'de bölünüyordu. Artık raporun kendi çıktı sütunları
üzerinde dört işlem yapan sütunlar tanımlanabiliyor.

### Formül veritabanına gitmiyor

Akla gelen ilk çözüm ifadeyi `SELECT` listesine yapıştırmak; rapor tasarımcısını
SQL konsoluna çeviren de tam olarak budur. Kayıt defteri zaten "istemciden gelen
hiçbir şey SQL olarak kullanılmaz" diye var.

Formül `report-formula.ts` içinde küçük bir ağaca **ayrıştırılıyor** ve sorgu
koştuktan **sonra**, dönen satırlar üzerinde JavaScript'te hesaplanıyor.
Veritabanına hiç ulaşmıyor. Bozuk bir formülün yapabileceği en kötü şey
ayrıştırılamamak, geçerli bir formülün yapabileceği en kötü şey bir sayı
üretmek.

Dilde **bilerek olmayanlar:** fonksiyon çağrısı, metin, karşılaştırma ve raporun
zaten seçmediği bir alanı adlandırmanın herhangi bir yolu. Her tanımlayıcı aynı
raporun bir çıktı sütununa karşılık gelmek zorunda — gelmiyorsa **kaydederken**
hata, çalışırken sessiz boş sütun değil.

### Sayı yerine boş

- **Sıfıra bölmek** `Infinity` değil **boş** üretiyor.
- **Boş bir değer sıfır sayılmıyor**, boşluk yayılıyor.

İkisi de "bu satır bu soruyu cevaplayamıyor" diyor ve bu doğru. Bilinmeyeni 0'a
çevirmek, insanların karar verdiği bir rapora yanlış bir sayı yazardı.

Ondalık hem `0.5` hem `0,5` yazılabiliyor — Türkçe klavyede ikincisi daha kolay
ve reddetmek kural değil bilmece olurdu. Sonuç iki haneye yuvarlanıyor, raporun
geri kalanıyla aynı.

### Sıralama yok, grafik var

Hesaplanmış sütuna göre **sıralanamıyor** ve bu bilerek: sıralama veritabanında
yapılıyor, orada bu sütun yok. Getirilmiş sayfayı sıralamak raporu değil
**dilimi** sıralar — "en yüksek 10" gibi görünür, değildir. Hata mesajı bunu
söylüyor.

Grafikler bitmiş satırlardan çizildiği için hesaplanmış sütun **grafik değeri
olabiliyor**. Sütunlar birbirine dayanabiliyor: dizideki sıra hesap sırası.

### Ekranda

Tasarımcıda "Hesaplanmış sütunlar" paneli: başlık, anahtar, formül, biçim.
Panelin asıl işi **ne yazılabileceğini göstermek** — formül ekrandaki Türkçe
başlıklara değil çıktı **anahtarlarına** başvuruyor, bu yüzden anahtarlar
listeleniyor ve tıklayınca formüle ekleniyor (`lineTotal__sum` tahmin edilecek
bir şey değil). Tanınmayan ad varsa satırın altında uyarı çıkıyor.

Sütun silindiğinde ona başvuran formül **silinmiyor**, uyarı veriyor: kullanıcının
yazdığı formülü sessizce atmak yanlış olurdu.

### Doğrulama

11 birim + 5 entegrasyon testi: işlem önceliği, virgüllü ondalık, metin gelen
toplamın sayıya çevrilmesi, sıfıra bölme, boş yayılması, bilinmeyen ad,
aritmetik olmayan her şeyin reddi (`>`, `SUM(x)`, `;`, tırnak), uzunluk/derinlik
sınırı, kademeli sütun ve gruplanmış/düz raporda uçtan uca hesap. Toplam
**551 test**.

## 52. API Uçları

| Method | Yol | Roller |
|--------|-----|--------|
| GET | `/api/health` | herkes (kimliksiz; yalnızca evet/hayır, 200/503) |
| POST | `/api/auth/[...nextauth]` | herkes (web cookie oturumu) |
| POST | `/api/auth/forgot-password` | herkes (yanıt her zaman aynı — hesap ifşa etmez) |
| POST | `/api/auth/reset-password` | bağlantı sahibi (token'ın kendisi kimlik) |
| POST | `/api/mobile/login` | herkes (bearer token üretir) |
| GET | `/api/mobile/me` | kimliği doğrulanmış |
| POST/DELETE | `/api/mobile/push-token` | kimliği doğrulanmış (sahip oturumdan, gövdeden değil) |
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
| GET · PUT | `/api/reports/definitions/:id/schedule` | yazma: sahibi + süper admin (gönderim sahibin kapsamıyla çalışır) |
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
| GET · POST | `/api/admin/cash-accounts` | süper admin (hesaplar + yöntem eşlemesi) |
| PATCH · DELETE | `/api/admin/cash-accounts/:id` | süper admin (hareketi olan hesap silinmez, kapatılır) |
| POST | `/api/admin/cash-accounts/:id/default` | süper admin (diğerlerinin bayrağını temizler) |
| PUT | `/api/admin/cash-accounts/bindings` | süper admin (yöntem → hesap; `null` varsayılana döndürür) |
| GET · POST | `/api/admin/cash-movements?accountId&source&direction&from&to` | süper admin (defter / elle giriş-çıkış) |
| POST | `/api/admin/cash-movements/transfer` | süper admin (iki bacak tek işlemde) |
| POST | `/api/admin/cash-movements/:id/reverse` | süper admin (yalnız elle/aktarım kaydı) |
| GET | `/api/admin/cash-movements/summary?from&to` | süper admin (gün sonu) |
| GET | `/api/cash-accounts` | plasiyer, süper admin (tahsilat seçicisi — bakiye göstermez) |
| GET · POST | `/api/admin/warehouses` | süper admin (`stock.view` / `stock.manage`) |
| GET | `/api/admin/stock?q&warehouseId&lowOnly` | süper admin (`stock.view` — seviyeler + kırılım) |
| GET · POST | `/api/admin/stock-movements?variantId&warehouseId&source&direction&q&from&to` | süper admin (defter / elle giriş-çıkış) |
| POST | `/api/admin/stock-movements/count` | süper admin (sayılan adet; farkı sistem yazar) |
| POST | `/api/admin/stock-movements/transfer` | süper admin (iki bacak tek işlemde) |
| POST | `/api/admin/stock-movements/:id/reverse` | süper admin (sipariş kaynaklı hareket reddedilir) |
| GET | `/api/admin/stock-movements/summary?from&to` | süper admin (dönem özeti, sebebe göre) |
| GET | `/api/admin/payment-intents?status&companyId&orderId` | süper admin (kart tahsilatları + aktif sağlayıcı) |
| POST | `/api/admin/payment-intents/:id/capture` | süper admin (kasaya yazan tek yol; çift tıklama ikinci kayıt yazmaz) |
| POST | `/api/admin/payment-intents/:id/cancel` | süper admin (tahsil edilmiş ödeme reddedilir — iade gerekir) |
| GET | `/api/branding/<dosya>` | herkes (kiracı klasöründeki logo/favicon — oturum taşımayan `<img>` ve yazdırılan belge için) |
| GET | `/api/announcements` | 4 rol (kendi firmasının grubuna göre süzülür) |
| GET | `/api/catalog/:id` | 4 rol (fiyat firmaya göre çözülür) |
| GET · PATCH | `/api/account` | kimliği doğrulanmış (yalnız kendi hesabı) |
| POST | `/api/account/password` | kimliği doğrulanmış (yalnız kendi hesabı) |
| GET | `/api/account/activity` | kimliği doğrulanmış (yalnız kendi kayıtları) |
| GET · PUT · DELETE | `/api/admin/page-layout/:key` | süper admin (`design.manage`; GET katalogla birlikte döner, DELETE varsayılana döndürür) |
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

## Ürün modeli

Her müşteri firma **kendi kurulumunda** çalışır — kendi sunucusunda ya da onun
için alınan hosting'de. Paylaşılan tek örnek yoktur. Bunun iki sonucu var:

- **`tenantId` hiçbir tabloda yok ve olmayacak.** Her kurulumun kendi
  veritabanı var; satır bazında kiracı ayrımı ve onun getirdiği "filtreyi unutup
  veri sızdırma" sınıfı hiç doğmuyor.
- **Sürüm firma bazlıdır.** A müşterisi bir sürümde, B müşterisi başkasında
  olabilir. Ortak şemada bu mümkün olmazdı.

Özelleştirme kiracı klasöründen gelir (Adım 26) ve dört katmandır. Sınırı
Next.js'in derleme modeli çizer, tercih değil:

| Ne değişiyor | Yayına alma |
|---|---|
| Satıcı kimliği, logo, marka dosyaları | **Anında** — dosya, mtime önbelleği (Adım 26 ✅) |
| Renk/font token'ları, metinler | **Anında** — CSS değişkeni (planlandı) |
| Sayfa düzeni: hangi blok, hangi sırada | **Anında** — JSON + blok kayıt defteri (planlandı) |
| Ödeme sağlayıcı, ERP eşitleme, iş kuralı | **Yeniden başlatma** — eklenti (planlandı) |
| Yeni React bileşeni | **Yeniden derleme** — o kiracının imajı |

---

## Bilinen Eksikler

Gerçekten yapılacak işler. Sıra yaklaşık olarak maliyet/etki sırasıdır,
söz değildir.

### Satışı engelleyenler

Bunlar olmadan sistem bir müşteriye teslim edilemez.

- ~~**Satıcı kimliği yok**~~ — Adım 26'da kapatıldı.
- ~~**Peşin satışın parası hiçbir deftere girmiyor**~~ — Adım 27'de kapatıldı: kasa/banka defteri, yöntem → hesap eşlemesi, gün sonu.
- ~~**Sanal POS yok**~~ — Adım 28'de bağlantı noktası kapatıldı: kayıt defteri, ödeme niyeti, elden POS sağlayıcısı. **Gerçek bir sağlayıcı adaptörü hâlâ yok** — iyzico/PayTR/VPOS'tan hangisinin yazılacağı müşteri seçimine ve sözleşmesine bağlı. Arayüz hazır; yazılacak şey tek dosyalık adaptör + 3-D Secure dönüş ve webhook rotaları.
- ~~**Çek/senet portföyü yok**~~ — Adım 41'de kapatıldı: kâğıt tahsilattan doğuyor (zorunlu ve tekil bağ), vade/banka/durum takibi var, para tahsilde kasaya giriyor, karşılıksızda kapanan borç ters kayıtla geri açılıyor.
- **E-Fatura / E-İrsaliye yok** — belge basılıyor, GİB'e gitmiyor; sunucu tarafı PDF de yok. Entegratör (EDM/Foriba/Sovos) ücretli dış bağımlılık, ve müşteriye göre değişir → eklenti noktası.
- ~~**Dağıtım hikâyesi yok**~~ — Adım 40'ta kapatıldı: üretim imajı, ayrı göç konteyneri, sağlık ucu, kurulum/yedek/geri yükleme/güncelleme betikleri, `DEPLOYMENT.md`. Merkezden güncelleme Adım 50'de kapandı (sürüm akışı + ajan + `/admin/surum`). **Filo görünümü yok** — hangi müşteri hangi sürümde sorusu tek ekranda cevaplanmıyor; yedekler aynı diskte duruyor, dışarı kopyalama operatörün işi.

### Yakın sırada

- ~~**Yönetim ekranları Faz 3**~~ — Adım 53'te kapatıldı: ortak dile `Checkbox` ve `LinkButton` eklendi, kontrol boyu ikiye indirildi, rapor tasarımcısı (kendi kopya `Panel`iyle birlikte) ve sipariş detayı taşındı, 19 ham checkbox ile 17 elle yazılmış "Yükleniyor…" süpürüldü. Yönetim tarafı vitrin kimliğini **almadı** — nötr dilde kaldı, karar buydu.
- ~~**Kampanya performans raporu yok**~~ — Adım 44'te kapatıldı: `PROMOTIONS` veri kümesi (kampanya × sipariş), kapsamı sipariş raporlarıyla aynı. **Hazır bir kampanya ekranı hâlâ yok** — rapor tasarımcısından kuruluyor.
- ~~**İş zamanlayıcı yok**~~ — Adım 43'te kapatıldı: uygulama içi zamanlayıcı, iş kayıt defteri, sahiplenme kuralı, `/admin/jobs` ekranı. Adım 44'te üzerine iki iş bindi: zamanlanmış rapor gönderimi ve TCMB kuru.
- ~~**Yetim görsel temizliği yok**~~ — Adım 43'te kapatıldı: hiçbir ürünün `images` dizisinde geçmeyen **ve** 24 saatten eski dosyalar siliniyor. Yaş koşulu, forma yüklenip henüz kaydedilmemiş görselin ayağının altından silinmesini engelliyor.
- ~~**Tahsilatta mükerrer koruması yok**~~ — Adım 43'te kapatıldı: `Transaction.idempotencyKey` tekil, koruma veritabanında. Aynı anahtarla gelen ikinci istek ilkinin sonucunu döndürüyor, bakiye bir kez düşüyor.
- ~~**Ziyaret raporu yok**~~ — Adım 44'te kapatıldı: `CHECKINS` veri kümesine `source` ve saklanan `durationMinutes` eklendi; "kim kaç ziyaret yaptı, ne kadar sürdü, kaçı sahadan" artık gruplanabiliyor.
- ~~**"Stok neden düştü" cevapsız**~~ — Adım 51'de kapatıldı: `StockMovement` defteri, eldeki adet artık onun bakiyesi, ERP senkronu ezmek yerine fark yazıyor. **Kalan:** sipariş bir depo seçmiyor — sipariş ve iptal hareketleri toplamı oynatıyor, kırılımı değil. Carinin bağlı deposundan düşürmek, backlog'daki "depo/şube bazlı stok + fiyat" maddesinin işi.
- ~~**Rota işleyicileri test edilmiyor**~~ — Adım 47'de kapatıldı: 115 rota testi (Adım 49'da 8 push testi eklendi), ağırlığı yetki sınırında. **Ekranlar (41 sayfa) hâlâ testsiz** ve tarayıcı seviyesinde e2e (Playwright) yok; `requirePage` yönlendirmeleri elle doğrulanıyor. Mobil uygulamada da tek test yok.

### Mobil

- ~~Sipariş detayı salt okunur~~ — Adım 45'te kapandı: onay, ret, iptal ve sevkiyat durumu telefondan yapılabiliyor; hangi düğmenin çıkacağını sunucunun verdiği `availableTransitions` ve izin belirliyor.
- ~~**Sepet hâlâ cihazda**~~ — Adım 45'te kapandı: mobil sepet web ile aynı `Cart` satırını kullanıyor.
- ~~Uygulama gerçek cihazda çalıştırılmadı~~ — Adım 45'te Android emülatöründe (API 37) uçtan uca koşturuldu.
- **Cari ekstre hâlâ salt okunur** — telefondan ekstre satırına müdahale edilmiyor; doğrusu bu, düzeltme ters kayıtla yapılır.
- ~~**Bildirim yok**~~ — Adım 49'da kapatıldı: `expo-notifications` + Expo push servisi; yeni/onaylanan sipariş, ziyaret çağrısı ve teslimat ataması cihaza düşüyor.
- ~~**Çevrimdışı çalışmıyor**~~ — Adım 49'da kapatıldı: okumalar diskten açılıyor, saha yazmaları kuyruğa giriyor. **Sipariş bilerek kapsam dışı** (gerekçe aşağıda).
- ~~**Sunucu adresi derlemeye gömülü**~~ — Adım 48'de kapatıldı: adres cihaz ayarı, giriş ekranından değiştirilebiliyor.
- ~~**Uzaktan güncelleme yok**~~ — Adım 48'de kapatıldı: `expo-updates` + EAS Update kanalı; JS düzeltmeleri Play Store'suz iniyor.
- **iOS'ta çalıştırılmadı** — yalnızca Android emülatöründe koşturuldu.

### Daha büyük

- **Hediye kademesi tek seviyeli** — "her 10 adette 1 bedava" var, ancak "10 alana 1, 50 alana 6" gibi artan kademe tek kampanyayla kurulamıyor; her kademe ayrı kampanya olur.
- **Görsel işlenmiyor** — yüklenen dosya olduğu gibi saklanıyor; küçük resim (thumbnail) üretimi, yeniden boyutlandırma ve WebP'ye dönüştürme yok. Depolama yerel disk; S3/MinIO sürücüsü yok.
- **Bildirim tercihi yok** — Adım 49'da push eklendi (e-postanın yanına), ama kullanıcı hangi olay için bildirim alacağını seçemiyor: ya hepsi ya hiçbiri. SMS kanalı da yok; o, sağlayıcı seçimi gerektiriyor.

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
- **Arayüz Faz 3 kalanı:** rapor tasarımcısı ve sipariş detayı ekranlarını da paylaşılan dile taşımak (vitrin kimliği yönetim tarafına uygulanmayacak).
- **Rapor tasarımcısı v3 (kalanı):** pano (birden çok raporu tek ekranda), PDF/XLSX eki. Hesaplanmış sütun Adım 56'da, zamanlanmış gönderim Adım 44'te geldi (CSV eki).
- **Görsel işleme:** küçük resim üretimi, yeniden boyutlandırma, WebP dönüşümü; yerel diskin yanına S3/MinIO sürücüsü.

### Uzun vadeli backlog

**Operasyon & sipariş**
- İade & değişim (RMA): talep → onay → ters cari + ters stok hareketi.
- Teklif yönetimi: sepeti teklife çevir → plasiyer özel fiyat/vade → müşteri onayı → siparişe dönüşüm.
- Hızlı & periyodik sipariş: geçmiş siparişi kopyala, SKU+miktar CSV/Excel toplu sipariş, abonelik siparişi.

**Cari & finans**
- Sanal POS adaptörü: iyzico / PayTR / banka VPOS — bağlantı noktası Adım 28'de açıldı, geriye somut adaptör + 3-D Secure dönüş/webhook rotaları kaldı. DBS (doğrudan borçlandırma) ayrı.
- Çek/senet: portföy Adım 41'de geldi; kalan iş sahadan **görselle** giriş ve risk hesabına işleme.
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
- Çoklu dil: arayüz yalnızca Türkçe. (Çoklu para birimi kapandı: hesap Adım 42'de, TCMB kuru çeken zamanlanmış iş Adım 44'te, belgede gösterim Adım 52'de.)
- Dışa açık B2B API + Webhook + OpenAPI: büyük bayi kendi ERP'sinden otomatik sipariş geçer.
- Temsilci devir defteri: plasiyer değişince sipariş, çek-senet, ziyaret ve sepet devri.
- Sunum/maskeleme modu: plasiyer müşteri yanındayken maliyet ve diğer müşteri bakiyeleri gizlenir.
