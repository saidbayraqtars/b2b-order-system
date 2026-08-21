# Teklif Şablonu — B2B Sipariş & Saha Yönetim Sistemi

> **Bu bir şablondur.** Köşeli parantezli alanlar (`[…]`) müşteriye göre
> doldurulur. Rakamlar **öneridir** — pazarlık payı ve gerekçeleri en altta.
> Fiyat modeli: **tek seferlik lisans + yıllık bakım.**

---

## 1. Teklif künyesi

| | |
|---|---|
| **Müşteri** | Kaanlar — Samsun Bölge Müdürlüğü |
| **Yetkili** | [Ad Soyad — görev] |
| **Konu** | B2B sipariş portalı + saha satış sistemi kurulumu |
| **Teklif no** | [YYYY-NN] |
| **Tarih** | [gg.aa.yyyy] |
| **Geçerlilik** | 30 gün |
| **Hazırlayan** | Said Bayraktar |

---

## 2. Neyi çözüyoruz

Samsun bölgesi bugün siparişi telefon, WhatsApp ve plasiyerin defteri
üzerinden alıyor. Bunun üç maliyeti var:

1. **Sipariş girişi iki kez yapılıyor** — plasiyer yazıyor, büroda biri ERP'ye
   giriyor. Aradaki her hata müşteriye yanlış mal olarak gidiyor.
2. **Müşteri kendi bakiyesini ve fiyatını göremiyor** — her soru bir telefon,
   her telefon bir kişinin zamanı.
3. **Son kullanma tarihi takibi kâğıtta** — SKT'si yakın mal depoda kalıyor,
   fire olarak yazılıyor. Şarküteride raf ömrü kısa; depoda unutulan bir parti
   doğrudan zarardır.
4. **Bir parti geri çağrılırsa** — o partinin hangi bayiye kaç adet gittiği
   bugün tek bir yerde durmuyor.

Teklif edilen sistem üçünü de kapatıyor: müşteri kendi fiyatıyla 7/24 sipariş
veriyor, plasiyer sahada telefondan sipariş/tahsilat/ziyaret giriyor, mal
**SKT'si en yakın partiden** çıkıyor.

---

## 3. Kapsam

### 3.1 Bayi portalı (web)
- Firmaya özel fiyatlı katalog: kategori, arama (ad/marka/SKU/**barkod**), sıralama, stok filtresi
- Ürün detayı, varyant tablosu, koli/adet kısıtları, minimum sipariş
- Sepet (sunucu tarafında), sipariş, sipariş onay akışı (müşterinin kendi içinde)
- Cari ekstre, yaşlandırma, bakiye ve kullanılabilir limit
- Ödeme yöntemi + vade seçimi, kredi limiti kontrolü
- Vitrin duyuruları (kayan şerit / banner / pencere)

### 3.2 Saha satış (mobil — Android APK)
- Plasiyer müşteri adına sipariş girer (portföyüyle sınırlı)
- Tahsilat: nakit, havale, çek, senet, kredi kartı — kasa/banka hesabına işler
- Ziyaret aç/kapat (GPS), ziyaret planı, harita ve sıralı rota
- Hedefler (ziyaret + ciro), kurye teslim listesi, imzalı teslim fotoğrafı
- Barkod/QR okuyucu, push bildirim, çevrimdışı çalışma
- Uzaktan güncelleme (OTA) — düzeltmeler mağazasız iner

### 3.3 Yönetim
- Ürün/varyant/fiyat/kategori/iskonto yönetimi, görsel yükleme
- Firma, adres, kullanıcı, müşteri grubu yönetimi
- **Kullanıcı bazlı yetki** — 38 adlandırılmış izin, tik tik seçim
- Sipariş yaşam döngüsü: onay, ret, sevkiyat, kısmi sevk, kısmi fatura, iptal
- İrsaliye/fatura numaralandırma, kargo etiketi ve 80 mm fiş basımı
- Kasa & banka defteri, çek/senet portföyü, gün sonu
- Kampanya motoru (koşul + aksiyon + kupon + adet kademesi)
- **Rapor tasarımcısı**: kullanıcı kendi raporunu kurar, kaydeder, paylaşır, panoya koyar, Excel/PDF alır, e-posta ile zamanlar
- Denetim kaydı (kim, ne zaman, neyi değiştirdi)

### 3.4 Gıda paketi
- **Parti (lot) & son kullanma takibi** — mal kabulde parti, satışta **FEFO** (SKT'si yakın önce çıkar)
- SKT'si geçmiş ve bloke parti satışa girmez; fire ayrı kayıt, gerekçesiyle
- Kalem bazlı uyarı eşiği, "30 gün içinde bozulacak" listesi
- **Çift birim**: kasa satılır, kilo konuşulur (1 kasa = 17 kg · 214,50 ₺/kg)
- Tartılarak sevk edilen mal işareti

### 3.5 ERP entegrasyonu (Vega)
- Müşterinin kendi makinesinde çalışan **köprü ajanı**: cari, stok, fiyat okur
- **Eşler, oluşturmaz** — ERP'de olmayan kayıt B2B'de kendiliğinden doğmaz
- ERP senkronu stoku **ezmez**, farkı kadar hareket yazar: "gece stok neden düştü" sorusunun cevabı defterde kalır
- ERP bakiyesi ayrı kolonda — iki defter birbirine karışmaz

### 3.6 Kurulum & işletim
- Müşteriye **ayrı kurulum**: kendi sunucusu, kendi veritabanı (ortak bulut yok)
- Üretim imajı, göç konteyneri, sağlık ucu, kurulum/yedek/geri yükleme betikleri
- Merkezden sürüm duyurusu + güncelleme ajanı
- Kiracı klasörü: satıcı kimliği, logo, belge başlıkları dosyadan

---

## 4. Kapsam dışı (açıkça)

Bunlar bilerek dışarıda — istenirse ek teklifle yapılır:

| Konu | Neden | Ek maliyet |
|---|---|---|
| **e-Fatura / e-İrsaliye GİB gönderimi** | Entegratör (EDM/Foriba/Sovos) sözleşmesi müşteriye ait, ücretli dış bağımlılık | Entegrasyon: [45.000] ₺ + entegratör aboneliği |
| **Sanal POS (kart ile tahsilat)** | Banka/sağlayıcı sözleşmesi müşteriye ait; altyapı hazır, adaptör yazılacak | [35.000] ₺ / sağlayıcı |
| **iOS uygulaması** | Android hazır; iOS için Apple Developer hesabı + test turu | [65.000] ₺ + yıllık 99 USD |
| **Depo/şube bazlı stok düşümü** | Bugün toplam üzerinden çalışıyor | [40.000] ₺ |
| **İade & değişim (RMA) akışı** | — | [55.000] ₺ |
| **Sunucu donanımı / hosting** | Müşterinin kendi sunucusu ya da bizim yöneteceğimiz VPS | aşağıda |

---

## 5. Bedeller

### 5.1 Tek seferlik — lisans + kurulum

| Paket | Kapsam | Bedel |
|---|---|---:|
| **A — B2B Portal** | 3.1 + 3.3 (yönetim) | **[285.000] ₺** |
| **B — B2B + Saha** ⭐ | A + 3.2 mobil/saha | **[425.000] ₺** |
| **C — Tam paket** | B + 3.4 gıda paketi + 3.5 ERP köprüsü | **[545.000] ₺** |

Üç pakette de: sınırsız kullanıcı, sınırsız ürün, sınırsız bayi. Kullanıcı
başına ücret **yok** — sistem müşterinin kendi sunucusunda çalışıyor.

**Önerilen: Paket C.** Vega köprüsü ve parti/SKT takibi zaten bu iş için yazıldı;
ayrı satın alınması hâlinde toplamı daha yüksek olur.

### 5.2 Yıllık bakım & destek

| | |
|---|---:|
| Yıllık bakım bedeli (lisansın %20'si) | **[109.000] ₺/yıl** |
| İlk 12 ay | **ücretsiz** (garanti kapsamı) |

Bakım kapsamı:
- Hata düzeltmeleri ve güvenlik güncellemeleri
- Yeni sürümlerin kuruluma inmesi (merkezden güncelleme)
- Mevzuat kaynaklı zorunlu değişiklikler (KDV oranı, belge formatı vb.)
- İş saatleri içinde e-posta/telefon desteği, aynı iş günü dönüş
- Ayda [4] saate kadar küçük düzenleme

Kapsam dışı: yeni modül geliştirme, veri girişi, kullanıcı eğitimi tekrarı.

### 5.3 Diğer kalemler

| Kalem | Bedel |
|---|---:|
| Ek geliştirme (adam/gün) | [14.000] ₺ |
| Yerinde eğitim (1 gün, [6] kişiye kadar) | [12.000] ₺ |
| Veri aktarımı (ERP'den ürün/cari ilk yükleme) | teklif kapsamında **ücretsiz** |
| Yönetilen sunucu (VPS + yedek + izleme) | [4.500] ₺/ay |

---

## 6. Ödeme planı

| Aşama | Oran | Ne zaman |
|---|---:|---|
| Sözleşme | %40 | imza |
| Kurulum & veri aktarımı | %30 | test ortamı müşteride açıldığında |
| Kabul | %30 | canlıya geçiş + 10 iş günü sorunsuz kullanım |

---

## 7. Takvim

| Hafta | İş |
|---|---|
| 1 | Sunucu kurulumu, kiracı klasörü (logo/unvan/belge başlığı), Vega köprüsünün müşteri makinesine kurulması |
| 2 | Ürün/cari/fiyat ilk aktarımı, müşteri grupları ve iskonto düzeninin kurulması |
| 3 | Bayi kullanıcılarının açılması, parti/SKT düzeninin kurulması, plasiyer telefonlarına APK |
| 4 | Pilot: [2-3] bayi + [1] plasiyer ile gerçek sipariş |
| 5-6 | Yaygınlaştırma, eğitim, canlıya geçiş |

---

## 8. Neden bu sistem

- **Kendi sunucunuzda çalışır.** Veriniz sizde; abonelik kesilirse sistem durmaz.
- **Kullanıcı başına ücret yok.** Bayi sayısı arttıkça maliyet artmaz.
- **ERP'nizi değiştirmez.** Vega yerinde kalır; köprü okur, ezmez. Yarın ERP değişirse köprü değişir, sistem değişmez.
- **Kaynak kodu teslim edilebilir** ([kod teslimi: + %25]).
- **Bölgeye kurulur, merkeze dokunmaz.** Merkezin sistemi ve süreci değişmiyor;
  fiyat ve ürün Vega üzerinden geliyor, bölge kendi bayi ağını ve sahasını
  buradan yönetiyor.
- **Parti izlenebilirliği.** Geri çağırmada "bu parti kime gitti" sorusu tek
  sorguyla cevaplanıyor.
- **Denetlenebilir.** Her stok hareketi, her tahsilat, her yetki değişikliği kim tarafından yapıldığı bilgisiyle duruyor.

---

## 9. Fiyat gerekçesi (iç not — müşteriye verilmez)

- **Kapsam kıyası:** Türkiye'de hazır B2B paketleri 150–400 bin ₺ bandında ve
  çoğu yalnızca portal veriyor; saha (plasiyer + tahsilat + ziyaret + rota),
  kasa/çek defteri, rapor tasarımcısı ve parti/SKT ayrı modül olarak satılır.
  Abonelikli SaaS'lar 8–25 bin ₺/ay bandında — 3 yılda 300–900 bin ₺ eder ve
  veri sağlayıcıda kalır. Tek seferlik model bunun karşısında güçlü bir argüman.
- **Pazarlık payı:** Paket C'de %10–12 (≈ 60.000 ₺) indirime yer var. İndirim
  yerine **ilk yıl bakımı** ve **eğitim** hediye edilirse fiyat çapası korunur.
- **Alt sınır:** Paket C için 470.000 ₺'nin altına inilmemeli; altında bakım
  geliri işi taşımıyor.
- **Bakım oranı:** %20 sektör normunun ortasında (%15–25). İlk yıl ücretsiz
  vermek, ikinci yıl faturasını normalleştiriyor.
- **Referans değeri:** İlk müşteri referans olacağı için, isim/logo kullanım
  izni karşılığında ek %5 indirim verilebilir — bunu ayrı bir kalem olarak
  yazmak, fiyatın kendisini düşürmekten iyidir.
