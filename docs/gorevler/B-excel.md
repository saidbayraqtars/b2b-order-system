# B — Excel ile her şeyi içe ve dışa aktarma (Codex, A'dan sonra)

Önce [`docs/IS-BOLUMU.md`](../IS-BOLUMU.md) okunur. Dal `codex/excel`,
`TEST_SCHEMA=test_codex`.

## Amaç

Said'in sözü: "her şeyi içeri ve dışarı aktarabilmeli". Sistem artık ERP'siz
satılıyor. Yeni müşteri 2-3 bin ürününü ve yüzlerce firmasını ekrandan tek tek
açamaz. Bugün Excel içe aktarma yalnız **fiyat ve stok güncelliyor**;
tanınmayan SKU reddediliyor (`packages/services/src/bulk-import.ts`). Ürün ya
da firma **oluşturan** bir yol yok.

Dışa aktarma aynı zamanda müşterinin elle aldığı yedek. "Tümünü dışa aktar"
düğmesi buradan çıkar.

## Değişmeyecek kural (mevcut desen)

`bulk-import.ts` içindeki akış korunur ve genişletilir, ikinci bir desen
yazılmaz:

```
dışa aktar → Excel'de düzelt → içe aktar → FARK ÖNİZLEMESİ → onayla → uygula
```

- Önizlemesiz uygulama yok. Önizleme ile uygulama arasındaki bağ **imza**:
  sunucu farkı hesaplayıp özetini imzalar, uygulama isteği imzayı geri getirir,
  sunucu farkı yeniden hesaplayıp karşılaştırır.
- Her satırın durumu: `create` · `update` · `unchanged` · hata
  (`unknown-…`, `invalid-…`). Hatalı satır varsa **hiçbir satır uygulanmaz**,
  hatalar satır numarasıyla gösterilir.
- Okuyucu: `xlsx-read.ts` (`readSpreadsheet` hem XLSX hem CSV okur,
  `parseDecimal` Türkçe ondalığı çözer). Yazıcı: `xlsx.ts`.
- Başlık eşleşmesi büyük/küçük harf ve Türkçe karakter duyarsız. Şablon
  dosyası her türden indirilebilir.
- Para ve stok etkisi olan içe aktarma yalnız mevcut tek kapılardan geçer.
  Stok `postStockMovement` (kaynak `COUNT` ya da `MANUAL`) üzerinden, cari
  hareket defter servisi üzerinden yazılır. Doğrudan `update` yasak.
- Her uygulama `AuditLog`'a bir satır yazar: kim, hangi tür, kaç satır.

## Kapsam

### İçe + dışa (oluştur ve güncelle)

| Tür | Eşleme anahtarı | Not |
|---|---|---|
| Kategoriler | yol (`Ana > Alt`) | Eksik üst kategori aynı dosyada önce gelirse oluşturulur, yoksa hata |
| Ürün + varyant | varyant `SKU` | Ürün satırı ürün adı + kategori yolu ile gruplanır. Sütunlar: barkod, birim, koli içi, asgari sipariş, KDV, raf kodu, asgari stok, maliyet, ağırlık, aktif |
| Müşteri grupları | ad | |
| Firmalar | `Cari kodu` (bugün `Company.externalCode`), yoksa vergi no | Grup, plasiyer (e-posta), kredi limiti, vade, ödeme yöntemleri, asgari sipariş tutarı |
| Firma adresleri | cari kodu + adres adı | Ayrı sayfa ya da ayrı dosya |
| Fiyatlar | SKU + grup + asgari adet | **Var**, korunur |
| Stok | SKU (+ depo) | **Var**, korunur. Depo sütunu eklenir |
| Depolar | ad | |
| Vade tanımları | ad | |
| Kasa / banka hesapları | ad | Bakiye içe aktarılmaz, açılış hareketiyle girer (aşağıda) |
| Cari açılış bakiyesi | cari kodu | Defterde tek bir açılış hareketi. Aynı firmaya ikinci açılış **reddedilir**; düzeltme ters kayıtla |

### Yalnız dışa

Siparişler (başlık + satır), faturalar, irsaliyeler, iadeler, cari hareketler
(ekstre), tahsilatlar, çekler, kasa hareketleri, stok hareketleri,
kampanyalar, kullanıcılar (**şifre ve 2FA alanları asla**), denetim kaydı
(var, korunur).

### Kullanıcı içe aktarma — bilerek yok

Hesap açan bir dosya, kimliği doğrulanmamış toplu kullanıcı demek. Bayilik
başvurusu bu yüzden hesap açmıyor (`docs/hafiza/b2b-dealer-application.md`).
Kullanıcılar ekrandan davet edilmeye devam eder.

### Tümünü dışa aktar

Yönetimde tek bir düğme. Çıktı **tek dosya, her tür ayrı sayfa**. Bunun için
`buildXlsx` çok sayfalı hâle getirilir: bugün tek sayfa yazıyor
(`sheet1.xml`, `workbookXml(name)`). İmza geriye uyumlu kalır, yeni
`buildWorkbook(sheets[])` eklenir ve eski fonksiyon onu çağırır.

- Yetki: yeni bir izin gerekir (örneğin `data.export`). "Şema istekleri"
  bölümüne yazılır, D akışı kayıt defterine ekler.
- Büyük veride bellek: satırlar sayfa sayfa okunur (cursor/`take`+`skip`).
  80 bin satırlık bir tablo tek `findMany` ile alınmaz.
- Bu bir **veri** dışa aktarımı, veritabanı yedeği değil. Ekranda ikisinin farkı
  bir cümleyle yazılır.

## Özel kod sütunları (D1'e bağlı)

D akışı ürünlere ve firmalara 10'ar özel kod alanı ekliyor
([D-claude.md](D-claude.md)). O dal `main`'e girince ürün ve firma
şablonlarına `Özel kod 1..10` sütunları eklenir. Sütun başlığı kurulumda
verilen etiketle yazılır (örneğin "Marka"), içe aktarmada hem etiket hem
"Özel kod N" kabul edilir. D1 gelmeden bu bölüm yapılmaz. Kalan her şey önce
biter.

## Ekran

`/admin/toplu-guncelleme` tek ekran olarak kalır, tür seçimi URL'de durur
(`?tur=urun`). Sekme/kip URL'de olmalı (`docs/hafiza/b2b-redesign.md`).
Önizleme tablosu 50 satırda kesilir ve altına "N satırdan 50'si gösteriliyor"
yazılır.

## Testler

- Servis: her tür için create / update / unchanged / hata satırı / imza
  uyuşmazlığı. Türkçe karakterli SKU ve ad, CSV, boş satırlar, binlik ayraçlı
  sayı (`1.234,56`).
- Rota: yetki (401/403), dosya boyu ve satır sınırı.
- Gidiş-dönüş: dışa aktar → değiştirmeden içe aktar → bütün satırlar
  `unchanged`. Bu test her tür için yazılır; şablon ile okuyucu arasındaki
  kaymayı yakalayan tek test budur.

## Çıktı

- Tür başına commit: `feat: firmalar Excel'den açılıp güncellenebiliyor` gibi.
- `FEATURES.md` güncellenir.
- [`IS-BOLUMU.md`](../IS-BOLUMU.md) "Durum" satırı güncellenir.
