# A — Eksik testler (Codex)

Önce [`docs/IS-BOLUMU.md`](../IS-BOLUMU.md) okunur: dal, çalışma klasörü,
`TEST_SCHEMA=test_codex`, bitti tanımı. Proje hafızası: `docs/HAFIZA.md`;
özellikle `docs/hafiza/b2b-route-tests.md` (harness ve altı kurulum tuzağı).

## Amaç

Bugün 1.115 test geçiyor ama 167 API rotasının **119'unun** rota testi yok
([liste](rota-test-listesi.txt)). Servis katmanı entegrasyon testleriyle
büyük ölçüde örtülü. Eksik olan şu: **uçta** kimin girebildiği, kimin neyi
görebildiği, gövde doğrulaması ve hata kodları. Müşteriye çıkan hataların çoğu
bu katmanda olur. Örnek: izin denetimi unutulmuş bir PATCH ucu ya da başka
firmanın kaydını döndüren bir GET.

Masaüstü kabuğunda (`apps/desktop`) da tek test yok. Bu belgenin son bölümüne
bakın.

## Nasıl yazılır

- Yer: `apps/web/test/<alan>.test.ts`. Mevcut örnekler: `holidays.test.ts`
  (kısa ve temiz), `route-scope.test.ts` (kapsam), `cheques.test.ts` (para).
- Harness: `callRoute(handler, { url, method, body, token|session, params })`,
  `Fixtures` (kullanıcı/firma/grup/varyant kurar, `teardown()` kendi satırlarını
  siler), `bearer(user)`, `hasDb`. Ayakta sunucu yok, veritabanı gerçek.
- `const suite = hasDb ? describe : describe.skip;` kalıbı korunur.
- Vitest `apps/web` içinden koşar: `cd apps/web && npx vitest run --maxWorkers=1 test/<dosya>`.
- Her dosya kendi `Fixtures` önekini kullanır ve `afterAll` içinde `teardown()` çağırır.
- Test adları Türkçe. Davranışı söyleyen kısa bir cümle olmalı. Dosyanın
  başına neden yazıldığını anlatan kısa bir yorum konur (mevcut dosyalardaki
  gibi).

## Her uç için asgari dört iddia

1. **Kimliksiz istek** → 401.
2. **Yetkisi olmayan rol veya izin** → 403. Yetki rolden değil izinden gelir
   (`docs/hafiza/b2b-permissions.md`). En az bir "aynı kabukta ama izni yok"
   kullanıcısı denenmeli.
3. **Mutlu yol**: doğru durum kodu + dönen gövdenin şekli + veritabanındaki etki.
4. **Kapsam**: plasiyer başka plasiyerin firmasını, firma kullanıcısı başka
   firmanın kaydını göremez ve değiştiremez (`route-scope.test.ts` deseni).

Ek olarak:

- **Gövdesi olan her uç:** geçersiz gövde 400 döner ve mesaj Türkçe olur.
- **Para ve stok uçları:** ters kayıt bakiyeyi eski hâline getirir. İkinci kez
  ters kayıt reddedilir. Tekrar anahtarı (idempotency) olan uçta aynı anahtarla
  gelen ikinci istek ikinci kayıt açmaz.

## Öncelik sırası

**P1 — para, stok, kimlik (önce bunlar):**
`admin/cash-accounts/**`, `admin/cash-movements/**` (reverse, transfer,
summary), `admin/stock-movements/**` (reverse, count, transfer, summary),
`admin/payment-intents/**` (capture, cancel), `invoices/[id]`,
`orders/[id]/invoices`, `orders/[id]/shipments`, `shipments/[id]`,
`reconciliations/**`, `collection-calls`, `admin/users/[id]/password`,
`account/password`, `auth/forgot-password`, `auth/reset-password`,
`admin/prices/[id]`, `admin/variants/[id]/prices`, `admin/companies/**`,
`admin/discounts/[id]`, `admin/payment-terms/**`, `admin/volume-tiers/**`,
`admin/customer-groups/**`, `erp/customers`, `erp/prices`, `erp/stock`,
`admin/erp/agents/**`.

**P2 — katalog, kurallar, operasyon:**
`admin/products/**`, `admin/variants/**`, `admin/categories/**`,
`admin/promotions/**`, `admin/document-series/**`, `label-templates/**`,
`admin/announcements/**`, `admin/page-layout/[key]`, `admin/order-policy`,
`admin/jobs/**`, `admin/audit/**`, `admin/bulk-import`, `admin/uploads`,
`deliveries/**`, `sales-targets/**`, `visit-requests/**`, `reports/**`,
`admin/backorders`, `admin/sales-reps`, `admin/stock`, `admin/warehouses`,
`admin/commission/**`, `admin/price-schedule/**`, `companies/[id]/aging`,
`orders/[id]`, `catalog/[id]`.

**P3 — kalanlar:** `health`, `branding/[...path]`, `media/[...path]`,
`masaustu/**`, `search`, `exchange-rates`, `activity`, `account/**`,
`announcements`, `categories`, `cash-accounts`, `payment-options`,
`volume-status`, `deliveries/uploads`.

`auth/[...nextauth]` NextAuth'un kendi ucu. Burada test edilmez; giriş kilidi
ve IP sınırı servis testlerinde var.

## Dosya yolları ve dosya sunan uçlar

`media/[...path]`, `branding/[...path]` ve `masaustu/[dosya]` dosya sunuyor.
Bu uçlarda **yol geçişi** denenir: `../`, kodlanmış `%2e%2e%2f`, mutlak yol ve
ters bölü. Hepsi 400 ya da 404 döner, dosya sistemi dışına çıkılmaz.

## Sağlık ucu

`/api/health` kimliksiz çalışır ve yalnız evet/hayır döner. Testte gövdede
bağlantı dizesi, dosya yolu ya da hata metni **olmadığı** da doğrulanır
(`docs/hafiza/b2b-deployment.md`).

## Masaüstü (`apps/desktop`)

`apps/desktop` Electron kabuğu; arayüzü sunucudan alır, kendi sürümünü
`/api/masaustu`'dan günceller (`docs/hafiza/b2b-masaustu.md`). `package.json`'da
`test` betiği yok. Şunlar yapılır:

1. `vitest` eklenir ve `test` betiği tanımlanır, turbo görev hattına girer.
2. Saf mantığın birim testleri yazılır: sunucu adresinin doğrulanması,
   güncelleme sürüm karşılaştırması, dosya adı süzgeci. Electron penceresi
   açılmaz.

## Çıktı

- Her alan için bir commit: `test: <alan> uçları için rota testleri`.
- Bulunan her hata, kanıtlayan testle aynı commit'te düzeltilir. Commit
  gövdesinde "test ne buldu" yazılır.
- İş bitince [`rota-test-listesi.txt`](rota-test-listesi.txt) yeniden üretilir.
  Hedef boş liste ya da kalan her satırın yanında gerekçe.
- [`IS-BOLUMU.md`](../IS-BOLUMU.md) "Durum" tablosundaki A satırı güncellenir:
  kaç test eklendi, kaç hata bulundu.

## Yapılmayacaklar

- Şemaya (`schema.prisma`, `migrations/`) dokunmak — gerekirse "Şema
  istekleri"ne yazılır.
- Testi geçirmek için üretim davranışını değiştirmek. Davranış yanlışsa hata
  olarak düzeltilir ve öyle yazılır. Doğruysa test davranışa uyar.
- `.env` dosyaları.
