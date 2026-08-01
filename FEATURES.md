# Özellik Envanteri

B2B Sipariş & Yönetim Sistemi'nde **şu an çalışan** özelliklerin listesi.

> **Güncelleme kuralı:** Her adım/commit sonunda bu dosya güncellenir. Bir özellik
> buraya ancak kodda çalışır durumdayken eklenir — planlananlar en alttaki
> "Sonraki Adımlar" bölümünde durur.

Son güncelleme: 2026-08-01 · Adım 6 sonu

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
| `User` | 4 rol, bcrypt şifre, firma üyeliği, plasiyer portföyü (`managedCompanies`) |
| `Company` | Cari hesap: kredi limiti, güncel bakiye, para birimi, sipariş onayı zorunluluğu, müşteri grubu, atanmış plasiyer |
| `Address` | Firma adresleri, varsayılan adres işareti |
| `CustomerGroup` | Fiyat kademesi grubu (Bayi, Toptancı, Zincir Market) |
| `Category` | Ağaç yapılı kategori (self-referans `parentId`) |
| `Product` / `ProductVariant` | Ürün + varyant (SKU, barkod, renk, beden, koli adedi, min sipariş, stok) |
| `Price` | Varyant × müşteri grubu × miktar kademesi fiyatı |
| `CompanyDiscount` | Firmaya özel iskonto (ürün veya kategori bazlı, yüzde ya da sabit) |
| `Order` / `OrderItem` | Sipariş başlığı + kalemler, fiyat anlık görüntüsü ile |
| `Transaction` | Cari defter (DEBIT/CREDIT), siparişe ve kaydeden kullanıcıya bağlı |
| `CheckIn` | Plasiyer saha ziyareti (GPS, giriş/çıkış saati, not) |
| `Cart` / `CartItem` | Taslak sepet (şema hazır — şu an sepet istemci tarafında tutuluyor) |

- Para birimi alanları `Decimal(14,2)`; hesaplamalar `Prisma.Decimal` ile, float yok.
- `Price` varsayılan kademesi için **kısmi unique index** (`Price_variant_default_tier_key`) — Prisma ifade edemediği için elle SQL migration.
- Seed: 4 rol için demo kullanıcı, 1 firma, kategoriler, ürün + varyantlar, grup fiyatları.

## 3. Kimlik Doğrulama & Yetkilendirme

- **Web:** Auth.js v5, Credentials provider, JWT cookie session.
- **Mobil:** aynı `AUTH_SECRET` ile imzalanmış 30 günlük HS256 JWT, `Authorization: Bearer`.
- `requireUser()` **her ikisini de** kabul ediyor → tek endpoint seti hem portalı hem uygulamayı besliyor.
- **4 rol:** `SUPER_ADMIN`, `COMPANY_ADMIN`, `COMPANY_STAFF`, `SALES_REP`.
- **3 katmanlı savunma:**
  1. Edge middleware — sayfa öneklerini role göre kapatır, `/login`'e ya da `/403`'e yönlendirir.
  2. `requirePage()` — Server Component'lerde rol kontrolü (yönlendirir).
  3. `requireUser()` — route handler'larda rol kontrolü (JSON 401/403 döner).
- `resolveCompanyId()` — istenen firmayı role göre yetkilendirir: kendi firması / plasiyer portföyü / admin herhangi biri.
- `BusinessError` kodları → HTTP durumlarına merkezî eşleme (`withAuthErrors`).

## 4. Fiyatlandırma

- **Grup + miktar kademeli fiyat:** firmanın müşteri grubuna özel fiyat varsa o, yoksa varsayılan kademe. Kademe = `minQuantity <= miktar` olanların en yükseği (eşitlikte en ucuz fiyat).
- **Firmaya özel iskonto:** ürün bazlı iskonto kategori bazlıyı ezer. Yüzde veya sabit tutar, birim başına, 0'ın altına inmez.
- Katalog fiyatları sunucuda firmaya göre çözülür — istemci hiç fiyat hesaplamaz.
- Fiyatı tanımsız varyant sipariş edilemez (katalogta "Fiyat tanımsız" olarak işaretlenir).

## 5. Sipariş

- **Satır doğrulama:** minimum sipariş miktarı, koli katı olma zorunluluğu, stok yeterliliği — her biri ayrı hata kodu döner.
- **Toplamlar:** ara toplam, iskonto toplamı, KDV, genel toplam — hepsi Decimal.
- **Durum akışı:** firma onay istiyorsa + oluşturan personelse → `PENDING_APPROVAL`; açık hesap + limit aşımı → `PENDING_CREDIT`; aksi halde `CONFIRMED`. Kredi kartı cari borç yazmaz.
- **Stok** tüm reddedilmemiş siparişlerde (bekleyenler dahil) oluşturma anında düşülür; red halinde iade edilir.
- **Cari borç** yalnızca `CONFIRMED` + açık hesapta yazılır — bekleyen siparişler onay anında borçlanır.
- Sipariş numarası `ORD-YYYYMMDD-NNNN`, yarış durumunda 2 kez yeniden dener.
- Tamamı tek transaction içinde — stok, borç ve bakiye asla birbirinden ayrışmaz.

### Onay akışı
- `PENDING_APPROVAL` → firma yöneticisi (kendi firması) veya süper admin onaylar → kredi kontrolü → `CONFIRMED` ya da `PENDING_CREDIT`.
- `PENDING_CREDIT` → **sadece süper admin** onaylayabilir (limit aşımı override).
- Red → `REJECTED` + stok iadesi.

## 6. Cari & Tahsilat

- Firma bazlı cari defter: sipariş borcu (DEBIT) ve tahsilat (CREDIT) kayıtları.
- `Company.currentBalance` defterden türeyen önbellek — her yazma aynı transaction içinde güncellenir.
- Saha tahsilatı: plasiyer/admin tutar + ödeme yöntemi + açıklama girer, bakiye anında düşer.
- Kullanılabilir limit = kredi limiti − güncel bakiye; katalog ve müşteri listesinde görünür.

## 7. Katalog Yönetimi (Adım 6)

Süper admin, ürün ağacını uygulama içinden yönetir — seed'e bağımlılık kalktı.

- **Kategori:** ağaç yapılı oluştur/yeniden adlandır/taşı/sil. Slug isimden türetilir (Türkçe karakter duyarlı: "Şişe & Kapak" → `sise-kapak`), çakışırsa `-2`, `-3` eklenir. Kendi altına taşıma engelli (döngü koruması). Alt kategorisi, ürünü veya iskontosu olan kategori silinemez.
- **Ürün:** ad, kategori, marka, KDV (%1/10/20), açıklama, görsel listesi, aktif/pasif. Pasif ürün katalogdan düşer ama geçmiş siparişlerde durur.
- **Varyant:** SKU, barkod, renk, beden, koli içi adet, minimum sipariş, stok. SKU ve barkod benzersizliği kontrol edilir. Stok satır içinde düzenlenir (yalnız blur/Enter'da yazar).
- **Fiyat kademesi:** varyant × müşteri grubu × minimum adet → fiyat. Aynı üçlü tekrar yazıldığında hata vermez, günceller (upsert). Grup seçilmezse varsayılan liste fiyatı olur. Fiyatı olmayan varyant listede uyarı ile işaretlenir.
- **Firma iskontosu:** firma detay sayfasında kategori **veya** ürün hedefli, yüzde ya da sabit tutar. Aynı satırda ikisi birden seçilemez (çözümleme ürünü kategoriye tercih eder), yüzde 100'ü aşamaz.
- **Silme kuralı:** siparişte kullanılan ürün/varyant asla silinmez (`IN_USE`) — pasife alınır, sipariş geçmişi bozulmaz.

## 8. Web Portal (`apps/web`)

| Sayfa | Rol | İçerik |
|-------|-----|--------|
| `/login` | herkes | Giriş; role göre ana sayfaya yönlendirir |
| `/portal` | firma yön./personel | Katalog, sepet, sipariş oluşturma |
| `/portal/approvals` | firma yöneticisi | Onay bekleyen siparişler, onayla/reddet |
| `/admin` | süper admin | Cari hesap tablosu + tüm siparişler, limit override onayı |
| `/admin/products` | süper admin | Ürün listesi: arama, kategori filtresi, stok/varyant/fiyatsız uyarısı |
| `/admin/products/new` | süper admin | Yeni ürün formu |
| `/admin/products/[id]` | süper admin | Ürün düzenleme + varyantlar + fiyat kademeleri |
| `/admin/categories` | süper admin | Kategori ağacı yönetimi |
| `/admin/companies/[id]` | süper admin | Firma özeti + firmaya özel iskontolar |
| `/rep` | plasiyer | **Şu an sadece iskelet sayfa** (gerçek işlevi mobilde) |
| `/403` | — | Yetkisiz erişim sayfası |

## 8. Mobil Uygulama (`apps/mobile`)

- Expo SDK 51, React Navigation (native stack), TanStack Query, Zustand, NativeWind.
- **Token cihaz keychain'inde** (expo-secure-store); açılışta `/api/mobile/me` ile doğrulanır, süresi dolmuşsa silinir.
- **Plasiyer akışı:** Müşterilerim (portföy, arama, bakiye + kullanılabilir limit) → Firma → Katalog / Sepet / Siparişler / Ziyaret / Tahsilat.
- **Firma kullanıcısı akışı:** doğrudan kendi firmasına düşer, plasiyer ekranları gizlidir.
- **Katalog:** firmaya çözülmüş fiyat, iskontolu fiyat üstü çizili gösterim, stok/koli/min bilgisi, stoksuz ve fiyatsız varyant sipariş edilemez.
- **Sepet:** koli katına yuvarlayan adet kontrolü, KDV'li toplam önizlemesi, ödeme yöntemi seçimi. **Firma bazlı** — müşteri değişince sıfırlanır (fiyat firmaya özeldir).
- **Ziyaret (check-in):** GPS koordinatlı açılış, not, kapatma; geçmiş ziyaret listesi. **Konum best-effort** — izin reddedilse veya alınamasa bile ziyaret konumsuz kaydedilir, plasiyer bloklanmaz.
- **Tahsilat:** tutar (virgüllü klavye desteği), ödeme yöntemi, açıklama; sonuç bakiyesi sunucudan döner.
- Türkçe para/tarih biçimlendirme, açık + koyu tema.

## 10. API Uçları

| Method | Yol | Roller |
|--------|-----|--------|
| POST | `/api/auth/[...nextauth]` | herkes (web cookie oturumu) |
| POST | `/api/mobile/login` | herkes (bearer token üretir) |
| GET | `/api/mobile/me` | kimliği doğrulanmış |
| GET | `/api/catalog?companyId&categoryId&search` | 4 rol |
| GET | `/api/categories` | 4 rol |
| GET | `/api/companies` | kimliği doğrulanmış (role göre kapsam) |
| POST · GET | `/api/orders` | 4 rol (kapsam role göre) |
| POST | `/api/orders/:id/approve` | firma yöneticisi, süper admin |
| POST | `/api/orders/:id/reject` | firma yöneticisi, süper admin |
| POST · GET | `/api/checkins` | plasiyer, süper admin |
| POST | `/api/checkins/:id/checkout` | plasiyer, süper admin (yalnız açan kapatır) |
| POST | `/api/payments` | plasiyer, süper admin |
| GET | `/api/admin/companies` | süper admin |
| GET · POST | `/api/admin/categories` | süper admin |
| PATCH · DELETE | `/api/admin/categories/:id` | süper admin |
| GET · POST | `/api/admin/products` | süper admin |
| GET · PATCH · DELETE | `/api/admin/products/:id` | süper admin |
| POST | `/api/admin/products/:id/variants` | süper admin |
| PATCH · DELETE | `/api/admin/variants/:id` | süper admin |
| GET · POST | `/api/admin/variants/:id/prices` | süper admin |
| DELETE | `/api/admin/prices/:id` | süper admin |
| GET | `/api/admin/customer-groups` | süper admin |
| GET · POST | `/api/admin/companies/:id/discounts` | süper admin |
| DELETE | `/api/admin/discounts/:id` | süper admin |

---

## Bilinen Eksikler

- **Sipariş sonrası akış yok** — `PROCESSING` / `SHIPPED` / `DELIVERED` durumları şemada var ama geçişleri yapan kod yok.
- **Cari ekstre ekranı yok** — `Transaction` kayıtları yazılıyor ama hiçbir yerde listelenmiyor.
- **Sepet sunucuda tutulmuyor** — `Cart`/`CartItem` modelleri boş duruyor, sepet istemci belleğinde.
- **Müşteri grubu ve firma yönetimi arayüzü yok** — grup, firma, kullanıcı, adres kayıtları hâlâ yalnızca seed ile giriliyor (katalog tarafı Adım 6'da çözüldü).
- **Görsel yükleme yok** — ürün görselleri elle URL olarak giriliyor.
- `/rep` web sayfası iskelet.
- **ESLint yapılandırılmamış** — `pnpm lint` interaktif kuruluma düşüp hata veriyor.
- **Otomatik test yok** — doğrulama manuel E2E scriptleri + typecheck + build ile yapılıyor.
- Mobil uygulama gerçek cihazda çalıştırılmadı, yalnızca bundle edildi.
- Şifre sıfırlama, e-posta/bildirim yok.

## Sonraki Adımlar (planlanan)

Sıralama kesin değil — öncelik iş ihtiyacına göre belirlenecek.

- **Adım 7 — Sipariş yaşam döngüsü:** hazırlama → sevk → teslim durum geçişleri, sipariş detay ekranı, irsaliye/fatura numaralandırma.
- **Adım 8 — Cari ekstre & raporlama:** hesap hareketleri ekranı, yaşlandırma, plasiyer performansı, tahsilat raporu.
- **Adım 9 — Stok hareket defteri:** çoklu depo + `StockMovement` defteri (ArcTeknik ERP şemasıyla hizalı).
- **Adım 10 — Promosyon motoru:** kural tabanlı (koşul + aksiyon + kupon) kampanya yapısı.
- **Kalite:** ESLint kurulumu, domain katmanı için birim testleri, API için entegrasyon testleri, CI.
