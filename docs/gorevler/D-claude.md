# D — Özel kodlar, modül aç/kapa, sadeleştirme (Claude)

Dal `claude/ozel-kod` ve devamı, klasör `D:\projeler\b2b-claude`,
`TEST_SCHEMA=test_claude`. **Şemanın tek sahibi bu akış**
([IS-BOLUMU.md](../IS-BOLUMU.md) kural 1).

## Said'in kararları (2026-10-04)

- Özel kod: **ürün + firma, 10'ar alan**, etiketi ekrandan verilir, seçenek
  listesi isteğe bağlı.
- Sadeleştirme: dördü birden — modül aç/kapa, menüyü 5-6 başlığa indirmek,
  basit/gelişmiş görünüm, ekran ekran yeniden tasarım.
- Özellik adaylarından **ilk üçü** alındı: kesirli stok, çoklu birim, depo
  bazlı kritik seviye.

## Durum (2026-10-04)

| Adım | Durum |
|---|---|
| D1 özel kodlar | ✔ `68de3f9` |
| D2 modül aç/kapa | ✔ `35081cd` |
| D3 menü 6 başlık, D4 basit/gelişmiş görünüm | ✔ `38d62bd` |
| F1 kesirli stok | ✔ `2e16988` — 15 miktar kolonu Decimal(14,3), varyanta `quantityScale` (0 = adet), API'de miktar sayı kalıyor |
| F2 çoklu birim | ✔ 2026-10-05 — `VariantUnit` (çarpan, barkod, fiyat); miktar taban birimde, paket fiyatı 6 ondalıkla iner; ERP `/api/erp/units` |
| F3 depo bazlı stok + kritik seviye | ✔ 2026-10-05 — "depo" modülü (kapalı başlar); sipariş müşterinin deposundan düşer, iptal/iade oraya döner; depo başına kritik seviye ve "sipariş alınmasın" |
| D5 ekran ekran | sırada |

D1-F1 main'e birleşti: `2955b58` (2026-10-04), push edildi. Sonraki iş
`claude/coklu-birim` dalında.

Ölçüm (F3 sonu): 1.205 test (erp-agent 22, servisler 760, web 423) yeşil; typecheck, lint, build (165 sayfa) yeşil.

## D1 — Özel kodlar (önce bu; B akışı buna bağlı)

Vega'nın `KOD1..KOD21` + `TBLSTOKKARTKODLABEL` / `TBLSTOKKODTAN` deseninin
(kılavuz §64) sade hâli.

- **Tanım tablosu:** varlık (ürün | firma) × yuva (1..10) → etiket, aktif mi,
  seçenek listesi (boşsa serbest metin), katalog süzgecinde gösterilsin mi.
- **Değerler kolon olarak:** `Product.code1..code10`, `Company.code1..code10`.
  JSON değil. Sebep: rapor motoru, süzgeç ve indeks düz kolonla çalışır.
  Değer etiket değil **veri**dir. Kılavuzun uyarısı: etikete değil içeriğe
  bakılır.
- Ürün özel kodu **ürün** düzeyinde durur, varyantta değil. Katalog süzgeci
  ürün listeler.
- Kullanıldığı yerler: yönetim formları, yönetim listelerinde süzgeç ve sütun,
  portal katalog süzgeci (yalnız "süzgeçte göster" işaretli alanlar),
  kampanya/fiyat kuralında koşul (ürün kodu = X, firma kodu = Y), rapor veri
  kümelerinde gruplanabilir alan, Excel (B akışı).
- Kapalı bir yuvanın değeri silinmez, yalnız gizlenir.

## D2 — Modül aç/kapa

- Kurulum başına modül listesi, yönetimde "Ayarlar → Modüller" ekranı.
  Adaylar: teslimat/kurye, çek-senet, prim, satış hedefi, kampanya, hacim
  iskontosu, saha ziyareti, rapor tasarımcısı, ERP köprüsü, sanal POS, iade,
  parti/SKT, etiket basımı, mutabakat, tahsilat çalışma listesi, analitik pano.
- Kapalı modül: menüde yok, sayfası 404, API ucu "modül kapalı" ile 403,
  mobilde ekranı yok (C akışı aynı anahtarları okur).
- Kapatmak **veriyi silmez**. Açık iş varsa (bekleyen teslimat, aktif
  kampanya) kapatma ekranı bunu sayıyla söyler, kapatmayı engellemez.
- Kontrol tek yerde: izin denetiminin (`requireUser` / `requirePage`) yanında.
  Her ekrana ayrı `if` yazılmaz.

## D3 — Menü 5-6 başlık

Satış · Katalog · Müşteriler · Finans · Raporlar · Ayarlar. Bugünkü yaklaşık
35 yönetim ekranı bu altı başlığa dağıtılır. Sayfa düzeni motoru izne göre
çalışmaya devam eder (`docs/hafiza/b2b-design-phase3.md`).

## D4 — Basit / gelişmiş görünüm

Kullanıcı tercihi. Basit görünümde ileri alanlar kapalı bölümün arkasında durur
(Faz 1-6'nın katlanır bölüm aletleri hazır, `b2b-yogunluk.md`). Varsayılan
**basit**. Tercih kullanıcının kaydında saklanır, cihazda değil.

## D5 — Ekran ekran

D2-D4'ten sonra, en çok kullanılan ekrandan başlayarak: sipariş listesi,
sipariş detayı, ürün formu, firma formu, portal katalog, sepet. Her ekran için
önce/sonra görüntüsü alınır.

## Kılavuzdan çıkan özellik adayları (Said seçecek)

Vega'da olup b2b'de olmayanlar. Sıra öneridir, karar değil.

1. **Kesirli stok.** `ProductVariant.stock` tamsayı. Kilo, metre ve litre
   satan müşteri bugün 0,75 kg stok tutamıyor. ERP senkronu da kesiri
   kırpıyor.
2. **Çoklu birim.** Bir ürün adet, koli ve palet olarak satılır; her birimin
   çarpanı, barkodu ve fiyatı ayrıdır (Vega `TBLBIRIMLEREX`). Bugün tek
   `unitsPerCase` + `unitFactor` var.
3. **Depo bazlı stok ve kritik seviye.** Sipariş depo seçmiyor. Depoya göre
   asgari stok ve "sipariş alınmasın" bayrağı yok (Vega `TBLSTOKENVANTER`).
4. **Muadil / alternatif ürün.** Stokta yoksa yerine önerilecek ürünler (Vega
   `TBLMUASTOKKODU`, `TBLALTERNATIFSTOKLAR`).
5. **Kural tabanlı fiyat.** "Firma özel kodu = BAYİ ve ürün özel kodu = X →
   liste 2 + %12" (Vega `TBLPROTOKOL`, kılavuz §61). D1'in üstüne kurulur.
6. **Ürün tipi.** Hizmet kartı stok tutmaz (nakliye, montaj).
7. **Fiyat geçmişi.** Eski fiyat ve değişim tarihi kartta görünür.
8. **Sipariş satır durumu.** Bekliyor / kısmi gönderildi / gönderildi / iade
   (kılavuz §62'deki sözlük).
