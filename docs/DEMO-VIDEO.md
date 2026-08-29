# Tanıtım videosu — çekim senaryosu

**Hedef:** 4–5 dakikalık, müşteriye önden gönderilebilen tanıtım videosu.
Toplantı açan şey bu; toplantının kendisi [`SUNUM.md`](SUNUM.md).

|                | Bu belge                                  | `SUNUM.md`                          |
| -------------- | ----------------------------------------- | ----------------------------------- |
| Süre           | 4–5 dakika (kısa kesim 90 sn)              | 18–22 dakika + soru                 |
| Kime           | Henüz tanışmadığın müşteri                | Karşında oturan müşteri             |
| Amaç           | Toplantı almak                            | Teklif bırakmak                     |
| Ne yapılmıyor  | Soru cevaplanmıyor, fiyat konuşulmuyor    | İkisi de yapılıyor                  |

Anlatım metinleri **okunmak için** yazıldı: cümleler kısa, rakam az, sıfat yok.
Süreler Türkçe için saniyede ~2,4 kelime kabul edilerek ölçüldü.

---

## 1. İki üretim biçimi — hangisi

|                        | **A · Ekranı sen kullanırsın**            | **B · Hazır görüntülere seslendirme**   |
| ---------------------- | ----------------------------------------- | --------------------------------------- |
| Hazırlık               | 30 dk kurulum + prova                     | Yok, 96 görüntü depoda hazır            |
| Çekim                  | 3–6 deneme (yanlış tık, gecikme)          | Tek seferde ses kaydı                   |
| Düzeltme               | Baştan çekim                              | Sesi yeniden okumak yeter               |
| Risk                   | Derleme gecikmesi, boş liste, hata ekranı | Yok — görüntüler betikle üretildi       |
| İkna                   | **Yüksek** (yaşayan sistem)               | Orta (broşür hissi verebilir)           |
| Hareket gösterebildiği | Sipariş verme, FEFO'nun partiyi düşürmesi | Yok                                     |

**Tavsiye: hibrit.** Omurga B (hazır görüntü + seslendirme), yalnızca **üç
sahne** canlı kayıt:

1. **Sahne 4 (fiyat)** — aynı ürün, iki bayi hesabı, farklı fiyat. İki ayrı
   ekran görüntüsüyle anlatılınca "montaj" gibi duruyor; canlı hesap
   değiştirmek inandırıcı.
2. **Sahne 6 (parti)** — sipariş verilince partinin stoktan düşmesi. FEFO'nun
   tek kanıtı hareketin kendisi.
3. **Sahne 7 sonu (telefon)** — mobil uygulamanın arşivlenmiş görüntüsü
   **yok**; ya emülatör/telefon kaydı alınır ya da o iki cümle metinden
   çıkarılır.

Kararsız kalırsan: **önce B'yi bitir, yayınla.** Üç canlı sahne sonradan
kesilip yerine konabilir — ses değişmez.

---

## 2. Hazırlık

### B için (seslendirme)

Görüntüler `docs/design/screens/` altında, 1440 px genişlik, ölçek 1, betikle
üretilmiş. Ekstra hazırlık yok. Sahne tablosundaki dosyaları bir klasöre kopyala
ve sahne numarasıyla adlandır (`01-portal-vitrin.png` …) — kurgu programında
sıralama böyle kolay oluyor.

Görüntüler **uzun** (bazısı 3000 px). Ekrana sığdırmak için küçültmek yazıyı
okunmaz yapıyor; onun yerine yavaş dikey kaydırma kullan (§5'te komutu var).

### A için (ekran kaydı)

`SUNUM.md` §0'daki hazırlık aynen geçerli: veritabanı, göç, gösterim verisi,
sağlık kontrolü, sekmeler, `tenant.json` başlığı. Ek olarak videoya özel:

- [ ] Kayıttan **önce** her sekmeyi bir kez gez — ilk açılışta derleme gecikmesi var
- [ ] Yönetici panosunun kârlılık bölümü için gecelik özet koşmuş olmalı:
      `/admin/jobs` → **Yönetici panosu özeti** → Çalıştır
- [ ] Tarayıcı yakınlaştırma %125, bildirimler kapalı, imleç vurgusu açık
- [ ] Ekran 1920×1080, tarayıcı tam ekran (F11), yer imleri çubuğu gizli
- [ ] Gerçek müşteri adı, gerçek fiyat, gerçek telefon **görünmesin**

---

## 3. Sahne planı

Toplam **4:45**. "Görüntü" sütunu `docs/design/screens/` altına görelidir.

| #   | Süre | Görüntü (B)                                     | Canlı kayıtta (A)                                     |
| --- | ---- | ----------------------------------------------- | ----------------------------------------------------- |
| 1   | 0:12 | Açılış kartı (yazı)                             | —                                                     |
| 2   | 0:23 | `adim-8/giris.png` + `adim-8/giris-dark.png`    | `/login`, temayı bir kez değiştir                     |
| 3   | 0:30 | `adim-2/portal-vitrin.png`, `portal-urun-detay` | `/portal`, barkodla ara → ürüne gir                   |
| 4   | 0:25 | `adim-4/admin-hacim-iskontosu.png`              | **Canlı:** iki bayi hesabıyla aynı ürün, farklı fiyat |
| 5   | 0:20 | `adim-15/siparis-kurallari.png`                 | `/admin/siparis-kurallari`, onay bekleyen sipariş     |
| 6   | 0:30 | `adim-5/admin-stok-partiler.png`                | **Canlı:** sipariş ver → partinin düştüğünü göster    |
| 7   | 0:30 | `adim-11/rep-pano.png`, `rep-tahsilat.png`      | `/rep`, tahsilat + ziyaret; **canlı:** telefon ekranı |
| 8   | 0:20 | `adim-5/kurye-masasi.png`, `belge-irsaliye.png` | `/admin/dagitim` → kurye ekranı → irsaliye            |
| 9   | 0:25 | `adim-4/admin-cekler.png`, `admin-kasa.png`     | `/admin/cekler`, `/admin/kasa`                        |
| 10  | 0:25 | `adim-12/pano-durum.png`                        | `/admin/analitik`                                     |
| 11  | 0:25 | `adim-17/pano-karlilik.png`                     | `?bolum=karlilik`, marj köprüsünü göster              |
| 12  | 0:20 | `adim-17/rapor-sablonlari.png`                  | `/reports/sablonlar` → bir şablonu **kur**            |
| 13  | 0:20 | `adim-6/admin-erp.png`                          | `/admin/erp`                                          |
| 14  | 0:10 | Kapanış kartı (yazı)                            | —                                                     |

---

## 4. Anlatım metni

Köşeli parantez içindekiler **okunmaz**, yönergedir.

### 1 · Açılış kartı — 0:12

> Toptancılar için bayi portalı, saha satış uygulaması ve ERP köprüsü.
> Siparişten tahsilata, sevkiyattan yönetici panosuna — tek sistem.

[Yazı kartı. Altta küçük punto: "Ekran görüntüleri gerçek veritabanından
alınmıştır."]

### 2 · Problem — 0:23

> Bugün sipariş nasıl geliyor? Telefonla, WhatsApp'tan, plasiyerin defterinden.
> Kim ne fiyat aldı, kimin limiti doldu, hangi mal ne zaman çıktı — hepsi
> birinin aklında. O kişi izne çıktığında sistem duruyor.
>
> Bu sistem o bilgiyi akıldan alıp yazıya geçiriyor.

### 3 · Bayi portalı — 0:30

> Bayiniz kendi kataloğuna giriyor. Aradığı kutunun barkodunu yazıyor; ürün
> adını bilmesine gerek yok. Kasa satılıyor ama fiyat kiloyla konuşuluyorsa
> ikisini de görüyor.
>
> Sipariş gece yarısı da veriliyor. Kimseyi aramıyor, kimse yazıyı yanlış
> anlamıyor.

### 4 · Fiyat — 0:25

> Ekranda gördüğü fiyat **onun** fiyatı. Grup fiyatı, firmaya özel iskonto,
> hacim indirimi — hepsi sunucuda hesaplanıyor. Tarayıcıya ham fiyat listesi
> hiç gitmiyor; müşteri başkasının fiyatını göremiyor.
>
> [Canlı: hesap değiştir.] Aynı ürün, başka bayi, başka fiyat.

**Vurgu:** *Müşterinin gördüğü fiyat, faturada çıkan fiyattır.*

### 5 · Kural ve onay — 0:20

> Asgari sipariş, koli katı, kredi limiti, kesim saati — kurallar sistemde.
> Yarım koli sipariş geçmiyor, limiti dolu bayi sipariş veremiyor.
>
> İsterseniz belli tutarın üstü onaya düşüyor: bayinin kendi yöneticisine ya
> da size.

### 6 · Parti ve son kullanma — 0:30

> Gıdada asıl mesele bu. Mal, son kullanma tarihi **en yakın** partiden
> çıkıyor. Sistem bunu kendisi yapıyor; depocunun hatırlamasına bağlı değil.
>
> [Canlı: sipariş ver, listeye dön.] Parti düştü, kalan adet güncellendi.
> Bir parti geri çağrıldığında hangi bayiye kaç adet gittiği tek ekranda.
>
> Son kullanma tarihi irsaliyeye de basılıyor — kimse defterden bakmıyor.

### 7 · Saha — 0:30

> Plasiyeriniz sahada. Her firmanın yanında üç iş var: sipariş, tahsilat,
> ziyaret. Tahsilatı aldığı yerde giriyor, akşam büroya dönüp defter
> geçirmiyor.
>
> Ziyaret kaydını sunucu işaretliyor; "girdim" demekle olmuyor.
>
> [Telefon kaydı varsa:] Aynı işler telefonda da var. Şebeke gittiğinde
> tahsilat ve ziyaret cihazda bekliyor, gelince kendiliğinden gidiyor —
> ikisi de olmuş bir şeyin kaydı. Sipariş beklemiyor: fiyatı ve stoğu
> sunucu çözüyor, sonra "aslında kalmamış" demek olmuyor.

### 8 · Sevkiyat — 0:20

> Sipariş depoya düşüyor. İrsaliye, kargo etiketi, fiş — hepsi basılıyor.
> Kurye kendi ekranından yalnızca kendi teslimatını görüyor, teslim kaydını
> orada giriyor.

### 9 · Para — 0:25

> Cari defter, kasa ve banka, çek-senet portföyü tek yerde.
>
> Çek, kasaya **tahsil edilince** giriyor — alındığında değil. Bu küçük bir
> ayrıntı gibi duruyor ama elinizde olmayan parayı kasada göstermeyen tek şey
> bu.
>
> Bayiye mutabakat gönderiliyor, cevabı sistemde duruyor.

### 10 · Yönetici panosu — 0:25

> Sabah açtığınız ekran: bu ayın cirosu geçen yılın aynı ayıyla, açık
> siparişler, vadesi geçmiş alacak, kasadaki para, bu ay ödenecek çekler.
>
> Karşılaştırma yıl-üstü-yıl. Toptan gıdada aydan aya kıyas ramazanı büyüme
> sanır.

### 11 · Kârlılık — 0:25

> Ciro büyürken kâr küçülebiliyor. Bu ekran nerede eridiğini gösteriyor:
> liste bedeli, firma iskontosu, hacim iskontosu, kampanya, maliyet, kalan
> kâr.
>
> Aynı kırılım firma, kategori ve plasiyer bazında da var. Hangi müşteriye
> hangi iskontoyu verdiğinizi görmeden hiçbirini kısamazsınız.
>
> Alış fiyatı girilmemişse sistem marj **yazmıyor** — uydurma bir yüzde
> göstermektense boş bırakıyor.

### 12 · Raporlar — 0:20

> Yirmi üç hazır rapor: satış, kârlılık, tahsilat, stok, saha, kampanya. Tek
> tıkla kuruluyor, sonra kendinize göre değiştiriyorsunuz.
>
> Kendi raporunuzu da kurabiliyorsunuz: sütunu seçiyorsunuz, süzgeci
> koyuyorsunuz, Excel'e alıyorsunuz. İsterseniz günde bir ya da haftada bir
> e-postanıza düşüyor.

### 13 · ERP köprüsü — 0:20

> ERP'niz yerinde kalıyor. Köprü ürünü, stoğu ve cari bakiyeyi ERP'den
> okuyor; sistem onu yeniden yaratmıyor, eşliyor.
>
> Sipariş aktarımı da var — kurulumda sizin ERP'niz üzerinde birlikte
> deneniyor.

### 14 · Kapanış — 0:10

> Sistem **sizin sunucunuzda** çalışıyor. Veri sizde. Kullanıcı başına ücret
> yok.
>
> İki bayi ve bir plasiyerle pilot kuralım — kendi ürünlerinizle, kendi
> fiyatlarınızla.

[Kapanış kartı: ad, telefon, e-posta. 3 saniye sabit dursun.]

---

## 5. Kurgu

### B için: uzun görüntüden kayan sahne (ffmpeg)

Tek görüntüden 12 saniyelik, yukarıdan aşağı yavaş kayan bir klip:

```bash
ffmpeg -loop 1 -i pano-karlilik.png -t 12 -vf "scale=1920:-1,crop=1920:1080:0:'(ih-1080)*t/12',format=yuv420p" -r 30 sahne-11.mp4
```

Kısa (ekrana sığan) görüntü için kaydırma gereksiz, sabit tut:

```bash
ffmpeg -loop 1 -i giris.png -t 8 -vf "scale=1920:-1,pad=1920:1080:0:(oh-ih)/2:white,format=yuv420p" -r 30 sahne-02.mp4
```

Sahneleri birleştir, sonra sesi bindir:

```bash
ffmpeg -f concat -safe 0 -i sahneler.txt -c copy sessiz.mp4
ffmpeg -i sessiz.mp4 -i seslendirme.m4a -c:v copy -c:a aac -shortest tanitim.mp4
```

`sahneler.txt` içeriği: her satır `file 'sahne-01.mp4'`.

### Araçlar (Windows)

- **Ekran kaydı:** OBS Studio (1920×1080, 30 fps) veya ShareX
- **Ses:** telefonun ses kaydedicisi bile olur; mikrofon ağızdan 15–20 cm,
  sessiz oda, klimayı kapat
- **Kurgu:** Clipchamp (Windows 11'de kurulu) yeterli; ffmpeg ile de olur
- **Altyazı:** **ekle.** Video çoğu zaman sessiz izleniyor. Clipchamp otomatik
  altyazı üretiyor, sonra elle düzelt

### Tempo

- Sahne başına tek fikir. Kamera bir yerde 3 saniyeden fazla durmasın
- Müzik varsa **çok kısık** (−25 dB) ve sözsüz; yoksa daha iyi
- Fare imlecini yavaş hareket ettir, tıklamadan önce yarım saniye bekle

---

## 6. 90 saniyelik kısa kesim

WhatsApp'tan gönderilecek sürüm. Sahneler: **1 → 3 → 4 → 6 → 7 → 11 → 14.**

Metin aynı, şu değişikliklerle:

- Sahne 4 tek cümleye iner: *"Ekranda gördüğü fiyat onun fiyatı; hesaplama
  sunucuda, tarayıcıya fiyat listesi hiç gitmiyor."*
- Sahne 11 tek cümleye iner: *"Ciro büyürken kârın nerede eridiğini gösteren
  bir ekran var."*
- Kapanış: *"Beş dakikalık uzun sürümü ve ekran görüntülerini gönderebilirim."*

---

## 7. Söylenmeyecekler

Videoda bir kere yalan söylersen kurulumda bedelini ödersin. Bunlar **yok**,
"yakında" bile denmeyecek:

| Konu               | Doğrusu                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| e-Fatura           | Belge basılıyor; GİB'e gönderim entegratör işi, sözleşme müşterinin adına |
| Kartla tahsilat    | Altyapı var, banka sözleşmesi ve canlı test ayrı kalem                   |
| iPhone uygulaması  | Kurulan uygulama Android; web her telefonda çalışıyor                    |
| WhatsApp/SMS       | Bildirim e-posta ve uygulama içi; WhatsApp ayrı iş                       |
| Çoklu dil          | Arayüz Türkçe                                                           |
| ERP'ye canlı yazma | Okuma çalışıyor; sipariş aktarımı kurulumda birlikte deneniyor           |

Ayrıca:

- **Rakam söyleme.** Fiyat teklifte konuşulur, videoda değil
- **Gerçek müşteri adı geçmesin.** Gösterim verisindeki isimler uydurma;
  kayıtta gerçek bir bayi adı görünüyorsa sahneyi yeniden al
- **Hata ekranı gösterme.** Limit aşımı gibi ret ekranları yalnızca "sistem
  buna izin vermiyor" demek için, üstünde durmadan

---

## 8. Yayın öncesi kontrol

- [ ] Ses seviyesi baştan sona aynı (normalize edildi)
- [ ] Altyazı var ve yazım hatası yok
- [ ] Hiçbir karede gerçek e-posta, telefon, vergi no, gerçek müşteri adı yok
- [ ] `tenants/demo/tenant.json` başlığı nötr ya da müşterinin unvanı
- [ ] Kapanış kartındaki iletişim bilgisi doğru
- [ ] Telefonda izlendi: yazılar okunuyor mu
- [ ] Dosya boyutu WhatsApp için 16 MB altında (kısa kesim), uzun sürüm için
      bağlantı (Drive/YouTube gizli bağlantı)
