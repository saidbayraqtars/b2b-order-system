# Gösterim Kullanıcıları

Yerel geliştirme ve demo kurulumundaki hesapların tam listesi.
Kaynak: `packages/database/prisma/seed-demo.ts` (gösterim) ve
`packages/database/prisma/seed.ts` (ilk temel seed).

> **Bu hesaplar yalnızca demo içindir.** Şifreler basit ve bu dosyada açıkça
> yazılı — dosya herkese açık depoda duruyor. Gerçek bir müşteri kurulumunda
> `seed-demo` **çalıştırılmaz**; çalıştırıldıysa bu hesapların hepsi silinir
> veya şifreleri değiştirilir. Aksi hâlde `patron@bayraktar.local` / `143688`
> ile sisteme tam yetkiyle giren herkes olur.

Giriş: <http://localhost:3000/login>

---

## 1. Satıcı firma — yönetim (`SUPER_ADMIN`)

Sistemi işleten firmanın kendi personeli. Firmaya bağlı **değiller**
(`companyId` boş); bütün müşterileri ve bütün siparişleri görürler.

| E-posta | Ad | Görev | Şifre |
|---|---|---|---|
| `patron@bayraktar.local` | Said Bayraktar | Patron | `143688` |
| `it@bayraktar.local` | IT Ekibi | Sistem yönetimi | `143688` |
| `satismudur@bayraktar.local` | Satış Müdürü | Satış / pazarlama | `143688` |
| `muhasebe@bayraktar.local` | Muhasebe | Kasa, tahsilat, cari | `143688` |

**Önemli:** Dördü de **aynı** `SUPER_ADMIN` rolünde — aralarında yetki farkı
yok. Muhasebe hesabı ürün silebilir, IT hesabı fiyat değiştirebilir. Ayrı
hesap olmalarının faydası yetki değil **izlenebilirlik**: denetim kaydı
(`AuditLog`) işi kimin yaptığını isimle gösteriyor ve bir kişi ayrılınca
yalnızca onun girişi kapanıyor. Görev bazlı ince yetki henüz yok.

---

## 2. Satıcı firma — saha (`SALES_REP`)

Plasiyer / satış temsilcisi. Yalnızca **kendilerine atanmış** firmaları
görürler; onlar adına sipariş girer, tahsilat yapar, ziyaret kaydeder.

| E-posta | Ad | Atandığı firma | Şifre |
|---|---|---|---|
| `temsilci1@bayraktar.local` | Ahmet Yılmaz | Ak Bayi Ticaret | `143688` |
| `temsilci2@bayraktar.local` | Ayşe Demir | Şahin Toptan | `143688` |
| `temsilci3@bayraktar.local` | Kemal Arslan | Anadolu Zincir Market | `143688` |

---

## 3. Müşteri firma kullanıcıları

Alıcı tarafı. Firmaya bağlıdırlar ve **yalnızca kendi firmalarını** görürler.

### `COMPANY_ADMIN` — firma yöneticisi
Kendi firmasının siparişlerini onaylar, firma personelini yönetir, cari
ekstresini görür.

| E-posta | Ad | Firma | Şifre |
|---|---|---|---|
| `yonetici@akbayi.local` | Ak Bayi Yöneticisi | Ak Bayi Ticaret | `143688` |
| `yonetici@sahintoptan.local` | Şahin Toptan Yöneticisi | Şahin Toptan | `143688` |
| `yonetici@zincirmarket.local` | Zincir Market Yöneticisi | Anadolu Zincir Market | `143688` |

### `COMPANY_STAFF` — firma personeli
Satın almacı. Sepet kurar, sipariş verir — firmanın ayarına göre siparişi
yöneticinin onayına düşebilir.

| E-posta | Ad | Firma | Şifre |
|---|---|---|---|
| `personel@akbayi.local` | Ak Bayi Personeli | Ak Bayi Ticaret | `143688` |
| `personel@sahintoptan.local` | Şahin Toptan Personeli | Şahin Toptan | `143688` |

> Anadolu Zincir Market'in personel hesabı bilerek yok — yalnızca yöneticisi
> olan bir firmanın nasıl davrandığını görmek için.

---

## 4. İlk temel seed'den kalan hesaplar

`prisma/seed.ts` ile gelen eski örnek kayıtlar. Şifreleri **farklı**:
`Password123!`

| E-posta | Rol | Firma | Şifre |
|---|---|---|---|
| `admin@b2b.local` | SUPER_ADMIN | — | `Password123!` |
| `rep@b2b.local` | SALES_REP | — (Örnek Ticaret'e atanmış) | `Password123!` |
| `manager@ornek.local` | COMPANY_ADMIN | Örnek Ticaret A.Ş. | `Password123!` |
| `staff@ornek.local` | COMPANY_STAFF | Örnek Ticaret A.Ş. | `Password123!` |

---

## Firmalar ve ayarları

Farklı senaryoları denemek için kasıtlı olarak farklı ayarlandılar.

| Firma | Grup | Kredi limiti | Vade | Sipariş onayı | Temsilci |
|---|---|---:|---:|---|---|
| Ak Bayi Ticaret | Bayi | 500.000 ₺ | 30 gün | Hayır | Ahmet Yılmaz |
| Şahin Toptan | Toptancı | 2.000.000 ₺ | 60 gün | **Evet** | Ayşe Demir |
| Anadolu Zincir Market | Zincir Market | 5.000.000 ₺ | 90 gün | **Evet** | Kemal Arslan |
| Örnek Ticaret A.Ş. | Bayi | 50.000 ₺ | 0 | **Evet** | Plasiyer Ali |
| Beta Dağıtım Ltd. | Bayi | 25.000 ₺ | 0 | Hayır | — |

Beta Dağıtım'ın ödeme yöntemi `CASH` ve `BANK_TRANSFER` ile **sınırlı**;
diğerlerinde liste boş, yani kısıtlama yok.

Müşteri grupları fiyatı belirliyor — aynı ürün Bayi'de, Toptancı'da ve
Zincir Market'te farklı fiyata görünür.

---

## Neyi denemek için hangi hesap

| Görmek istediğiniz | Giriş |
|---|---|
| Yönetim paneli, tüm siparişler, kasa, ERP köprüsü | `patron@bayraktar.local` |
| Plasiyerin saha ekranı: müşteri adına sipariş, tahsilat, ziyaret | `temsilci1@bayraktar.local` |
| Alıcı mağazası, sepet, kendi cari ekstresi | `yonetici@akbayi.local` |
| Onaya düşen sipariş akışı | `personel@sahintoptan.local` ile sipariş ver, `yonetici@sahintoptan.local` ile onayla |
| Grup fiyatının değişmesi | Aynı ürüne `yonetici@akbayi.local` (Bayi) ve `yonetici@zincirmarket.local` (Zincir) ile bak |

---

## Yeniden kurmak

```bash
pnpm --filter @repo/database db:seed        # temel seed
pnpm --filter @repo/database db:seed-demo   # gösterim hesapları + katalog
```

Gösterim seed'i `upsert` kullanıyor: tekrar çalıştırmak kayıt kopyalamaz,
mevcut satırları günceller.
