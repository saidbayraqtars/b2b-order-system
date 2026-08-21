# Yeni kurulum — sıfırdan çalışır sisteme

Bu belge bir kurulumun **ilk gününü** anlatıyor. Aynı sıra yönetim panelinde
canlı olarak da duruyor: **Yönetim → Sistem → Kurulum** (`/admin/kurulum`).
Ekrandaki liste veritabanından okunuyor, yani hangi adımın bittiği tahmin
değil — sayılarla görünüyor.

## 0. Sunucu ayağa kalkar

```bash
cp .env.production.example .env.production   # doldur
./scripts/install.sh
```

Sektör iskeletini kurulumla birlikte açmak için:

```bash
SETUP_PACK=gida-toptan ./scripts/install.sh
```

`install.sh` sırayla yapılandırmayı denetler, şemayı kurar, **tek** süper admin
hesabını açar, istenmişse sektör paketini uygular ve en son web'i açar. Web'in
en sonda olması bilinçli: hesabı olmayan ve şeması yarım bir sistem dışarıya
açık durmamalı.

## 1. Sektör paketi (isteğe bağlı, 1 dakika)

Paket, her toptancıda hemen hemen aynı olan **iskeleti** kurar:

| Paket | İçerik |
|---|---|
| `gida-toptan` | 4 müşteri grubu, 25 kategori (şarküteri/süt/dondurulmuş/kuru gıda/içecek/sarf), 5 vade (peşin–45 gün), 2 depo (merkez + soğuk hava), 2 hesap (kasa + banka), 3 hacim kademesi |
| `genel-toptan` | 3 grup, 1 kategori, 3 vade, 1 depo, 1 kasa |

Uygulamanın iki yolu var — panelde **Kurulum → Bu paketi uygula** düğmesi, ya da:

```bash
pnpm --filter @repo/services setup:pack gida-toptan
pnpm --filter @repo/services setup:pack --list      # paketleri listele
```

Üç şeyi bilerek yapmıyor:

- **Ürün, fiyat ve müşteri taşımıyor.** Bunlar her firmada başka; hazır liste
  koymak, kurulumu yapan kişiye silmesi gereken bir yığın bırakmak olurdu.
- **Var olan satıra dokunmuyor.** Düğmeye ikinci kez basmak, ilk seferden sonra
  elle yapılan düzenlemeleri geri almamalı. Eşleşme her tür için o türün eşsiz
  anahtarı: grup/vade/kasa adı, kategori slug değeri, depo kodu.
- **İkinci bir varsayılan depo/kasa işaretlemiyor.** Zaten varsayılanı olan bir
  kurulumda stok ve paranın nereye düşeceği belirsizleşirdi.

Paket neden veritabanı yedeği değil, **kod**: yedek alındığı günün şemasına
aittir. Bir sonraki sürümün göçü çalıştığında eski dump yüklenmez, üstelik
içinde gösterim kullanıcıları ve siparişleri de taşınır. Paket ise göçlerle
birlikte yaşayan sıradan kod.

## 2. Adımlar — sıra bağımlılık sırasıdır

Sıra rastgele değil. Yanlış sırada ilerleyen kişi bunu ancak boş bir açılır
listede fark ediyor.

| # | Adım | Ekran | Atlanırsa |
|---|---|---|---|
| 1 | Firma bilgileri | `/admin/organization` (kaynak: `tenant.json`) | Fatura/irsaliye geçersiz basılır |
| 2 | Müşteri grupları | `/admin/customer-groups` | Grubu olmayan firma liste fiyatı görür |
| 3 | Kategoriler | `/admin/categories` | Ürün açılamaz |
| 4 | Depolar | `/admin/stok` | Mal kabul yapılamaz |
| 5 | Ürün + varyant | `/admin/products` | — |
| 6 | Fiyatlar | `/admin/products` | Fiyatsız varyant sepete girmez |
| 7 | Vadeler | `/admin/payment-terms` | Yalnızca peşin çalışır |
| 8 | Kasa/banka | `/admin/kasa` | Tahsilat kaydedilemez |
| 9 | Firmalar | `/admin/companies` | — |
| 10 | Kullanıcılar | `/admin/users` | Bayi/plasiyer/kurye giremez |
| 11 | Açılış stoğu *(isteğe bağlı)* | `/admin/stok` | Stok uyarıları yanlış çalışır |
| 12 | ERP köprüsü *(isteğe bağlı)* | `/admin/erp` | Cari/stok iki yerde ayrı kalır |

İlk 10 adım tamamlandığında sistem sipariş alabilir; sihirbaz bunu
"Kurulum tamam" satırıyla söylüyor. 11 ve 12 bu hesaba girmez ama listede
durur — unutulmasınlar diye.

### Firma bilgileri neden ekrandan girilmiyor

Kaynak **dosya**: `TENANT_DIR` altındaki `tenant.json`. Ekran onu yalnızca
gösteriyor. İki kaynak olsaydı — ekranda bir unvan, dosyada başka bir unvan —
bir sonraki destek devrinde hangisinin doğru olduğu bilinmezdi. Dosyayı
düzenleyip sayfayı yenilemek yeter, sunucuyu yeniden başlatmak gerekmez.

## 3. Kurulum bitince

- Süper admin şifresini `/hesabim` ekranından değiştir.
- Yedek: `./scripts/backup.sh`, geri yükleme `./scripts/restore.sh`.
- Sürüm yükseltme: `./scripts/update.sh` — sihirbaz ve paket, göçlerle birlikte
  güncellenir, kurulum sonrası yeniden çalıştırılabilir.
