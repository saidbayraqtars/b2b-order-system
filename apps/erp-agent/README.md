# ERP Ajanı

Müşterinin **kendi makinesinde** çalışır, ERP'sini okur, normalize veriyi B2B'ye
HTTPS ile gönderir.

```
ERP (VegaDB)  ──oku──▶  ajan  ──HTTPS──▶  B2B
```

## Neden ajan var

B2B, müşterinin SQL Server'ına ağ üzerinden uzanmaz. Uzanması için ya veritabanı
internete açılırdı ya da VPN kurulurdu; ikisi de bir sipariş sisteminin
müşteriden isteyeceği şeyler değil.

**ERP şemasını bilen taraf ajandır, B2B değil.** Bu bir güvenlik kararı:
alternatifi — kendisine gönderilen SQL'i çalıştıran bir ajan — B2B sunucusunu
ele geçiren birinin müşterinin muhasebe veritabanında keyfi SQL çalıştırması
demekti. Ajan yalnızca `src/vega.ts` içinde yazılı olan sorguları çalıştırır,
başka hiçbir şeyi.

**Ajan ERP'ye yazmaz.** Bu klasörde tek bir INSERT/UPDATE/DELETE yoktur.
Veritabanı kullanıcısına `db_datareader` dışında yetki vermeyin.

## Kurulum

1. B2B'de **Yönetim → ERP** ekranından ajan açın. Token **bir kez** gösterilir;
   kaybedilirse yenilenir (eskisi anında geçersiz olur).
2. `agent.config.example.json` dosyasını `agent.config.json` olarak kopyalayın,
   doldurun.
3. Çalıştırın:

```bash
pnpm sync            # bir kez eşitle ve çık (Görev Zamanlayıcı için)
pnpm dev             # sürekli çalış, intervalMinutes'ta bir tekrarla
pnpm build && node dist/index.js --once
```

`--config baska.json` ile farklı bir dosya verilebilir; `AGENT_CONFIG` ortam
değişkeni de okunur.

## `vega.firma` / `vega.donem` nedir

VegaDB çok firmalı ve çok dönemli; tablo adları bu ikisinden kurulur:
`F0101D0017TBLSATFATBASLIK` = firma 0101, dönem 0017. Bu yüzden ikisi de
yapılandırmada durur, **tahmin edilmez** — dönemi yanlış tahmin eden bir
eşitleme geçen yılın rakamlarını okur ve çalışıyormuş gibi görünür.

Dönem kodları `TBLDONEM` tablosunda; ilk müşteride D0016=2025, D0017=2026.

## Ne eşitleniyor

| Eşitleme | Kaynak | Durum |
|----------|--------|-------|
| Cari kartları + bakiye | `TBLCARI` + `TBLCARIHAREKETLERI` | ✅ |
| Stok | `TBLSTOKENVANTER` + `TBLSTOKLAR` (depo toplamı − rezerv) | ✅ |
| Fiyat listesi | firmaya göre değişir | ❌ yazılmadı |

**Fiyat neden yok:** satış fiyatının Vega'da nerede tutulduğu kuruluma göre
değişiyor. İlk müşterinin veritabanında bariz aday olan `ISKSATISFIYATI2`
kolonu 95.026 stok kartının **1**'inde dolu — yani orası değil. Fiyat, müşteriden
tahsil edilecek tutarı belirler; makul görünen bir tahmin, sessizce bütün
katalogu yeniden fiyatlandırırdı. B2B tarafı hazır (`/api/erp/prices` yazıldı ve
test edildi); yapılacak iş `src/vega.ts` içindeki `readPrices`'ı o kuruluma göre
yazıp `sync.prices`'ı açmak.

## Eşleme

Ajan **hiçbir kayıt oluşturmaz**, yalnızca eşleşenleri günceller:

- Cari → `Company.externalCode` = Vega'daki `FIRMAKODU`
- Stok → `ProductVariant.externalCode` = Vega'daki `STOKKODU`

Eşleşmeyen satırlar B2B'de **Yönetim → ERP** ekranında kod ve sebebiyle listelenir.
Bu bilerek böyle: ERP'de 79.829 cari var, bunların hangisinin B2B müşterisi
olacağı bir insanın kararı — içe aktarmanın değil.

## Cari bakiyesi

Vega'nın bildirdiği bakiye `Company.erpBalance` alanına yazılır, **`currentBalance`
üzerine değil**. İkincisi B2B'nin kendi defterinden türer ve her ekran ona göre
toplam alır; başka bir defterden gelen bir sayıyla üzerine yazmak, bakiyeyi
yanında basılan ekstreyle çelişir hâle getirirdi. İki defter yan yana gösterilir.
