# Sunum Kılavuzu & Konuşma Metni

**Hedef müşteri:** Kaanlar — Samsun Bölge Müdürlüğü.
Şarküteri/et ürünleri dağıtımı, sahada plasiyerleri var, bugün Vega ERP kullanıyor.
**Süre:** 18–22 dakika demo + 10 dakika soru.
**Kural:** her ekranda **bir** cümle problem, **bir** hareket, **bir** cümle sonuç.

> Toplantıdan **önce** gönderilen 4–5 dakikalık tanıtım videosunun çekim
> senaryosu ayrı belgede: [`DEMO-VIDEO.md`](DEMO-VIDEO.md). Bu belge karşında
> oturan müşteri için, o henüz tanışmadığın müşteri için.

---

## Müşteriye özel — sunumdan önce oku

Bu üç şey, bu müşteride diğerlerinden daha çok konuşulacak:

1. **Soğuk zincir + kısa raf ömrü.** Şarküteride raf ömrü 45–75 gün bandında.
   SKT'si yaklaşan mal, bekleyen mal değil **eriyen para**. FEFO bölümü bu
   yüzden sunumun kalbi — orada acele etme.
2. **Parti izlenebilirliği.** Üretici bir partiyi geri çağırdığında, o partinin
   hangi bayilere kaç adet gittiği tek sorguda çıkıyor. Bunu açıkça söyle;
   bölge müdürlüğü için bu bir risk yönetimi meselesi, konfor değil.
3. **Bölge müdürlüğü olması.** Fiyat ve kampanyayı çoğu zaman merkez belirler,
   bölge dağıtır. Bunu bir engel gibi değil, avantaj gibi anlat: kurulum
   bölgeye yapılıyor, merkezin fiyatı ERP'den geliyor, bölge kendi bayi ağını
   ve sahasını buradan yönetiyor. Merkezin sistemine dokunulmuyor.

Bilmiyorsan uydurma — "bölgede kaç bayi var, kaç plasiyer çalışıyor, hangi
Vega sürümü" sorularını **sen sor**. Cevapları teklifin son hâline girecek.

---

## 0. Sunumdan önce (30 dakika)

```bash
# 1) Veritabanı ayakta mı
docker compose up -d

# 2) Göç + gösterim verisi (idempotent, tekrar çalıştırılabilir)
pnpm --filter @repo/database db:migrate
pnpm --filter @repo/database db:seed
pnpm --filter @repo/database db:seed-demo
pnpm --filter @repo/database db:seed-gida     # gıda kataloğu + partiler

# 3) Uygulama
pnpm --filter web dev                          # http://localhost:3000

# 4) Sağlık kontrolü — yeşilse başlayabilirsin
curl -s http://localhost:3000/api/health
```

### Açılacak sekmeler (sırayla)

| # | Sekme | Adres | Hesap |
|---|---|---|---|
| 1 | Bayi vitrini | `/portal` | `yonetici@akbayi.local` |
| 2 | Plasiyer | `/rep` | `temsilci1@bayraktar.local` |
| 3 | Yönetim | `/admin` | `patron@bayraktar.local` |
| 4 | Stok & parti | `/admin/stok` | patron |
| 5 | Raporlar | `/reports` | patron |
| 6 | Telefon/emülatör | mobil uygulama | `temsilci1@bayraktar.local` |

Şifre: `143688` (gösterim hesapları).
Tam liste: [`DEMO-KULLANICILAR.md`](../DEMO-KULLANICILAR.md)

### Belge başlığı — kayıttan önce 2 dakika

Fatura ve irsaliyenin üstündeki satıcı bilgisi `tenants/demo/tenant.json`
dosyasından geliyor ve şu an **"Demo Toptan Ticaret A.Ş."** yazıyor.

- Nötr bırakmak istersen: dokunma, "bu alan sizin unvanınızla doldurulur" de.
- Etkileyici olsun istersen: dosyadaki `legalName`/`tradeName`/`address`
  alanlarını müşterinin bilgileriyle doldur ve uygulamayı yeniden başlat —
  belge onların başlığıyla çıkar.
- **Vergi no, Mersis gibi alanları uydurma.** Bilmiyorsan boş bırak; sunumda
  "bu alanlar kurulumda sizin bilgilerinizle dolduruluyor" demek yeterli.

### Son kontrol listesi
- [ ] `/admin/stok` → Partiler panelinde **kırmızı** (SKT geçmiş) ve **sarı** (yaklaşan) satır görünüyor
- [ ] Tarayıcı yakınlaştırma %125 (ekran kaydında yazılar okunsun)
- [ ] Bildirimler kapalı, gereksiz sekmeler kapalı
- [ ] Karanlık/aydınlık tema seçili ve sabit
- [ ] Telefon ekranı yansıtma açık (mobil bölüm için)

---

## 1. Açılış — 60 saniye

> **Söylenecek:**
>
> "Bugün üç şey göstereceğim. Birincisi: bayiniz siparişi kendisi, kendi
> fiyatıyla, gece yarısı bile verebiliyor. İkincisi: plasiyeriniz sahada
> telefondan sipariş, tahsilat ve ziyaret giriyor — akşam büroya dönüp defter
> geçirmesine gerek kalmıyor. Üçüncüsü, ve gıdada en önemlisi: mal, son
> kullanma tarihi en yakın partiden çıkıyor. Sistem bunu kendisi yapıyor,
> kimsenin hatırlamasına bağlı değil.
>
> Vega'ya dokunmuyoruz. Vega yerinde kalıyor, sistem onu okuyor."

---

## 2. Bayi vitrini — 3 dakika

**Ekran:** `/portal` · **Hesap:** `yonetici@akbayi.local`

**Yapılacak:**
1. Katalogda **barkod** ile ara (`8690001000011`) → peynir gelsin
2. Ürüne tıkla → `/portal/urun/[id]` varyant tablosu
3. Fiyata dikkat çek → sepete ekle
4. Farklı hesapla aynı ürünü göster (`yonetici@zincirmarket.local`) → **fiyat farklı**

> **Söylenecek:**
>
> "Bayi kendi kataloğuna bakıyor. Aradığı kutunun barkodunu yazıyor —
> ürün adını bilmesine gerek yok.
>
> Fiyat burada önemli: bu ekranda gördüğü fiyat **onun** fiyatı. Grup fiyatı,
> firmaya özel iskontosu, hacim indirimi — hepsi sunucuda hesaplanıyor.
> Tarayıcıya ham fiyat listesi hiç gitmiyor, yani müşteri başkasının fiyatını
> göremiyor. Şimdi aynı ürüne zincir market hesabıyla bakıyorum — gördüğünüz
> gibi fiyat farklı.
>
> Koli katı, minimum sipariş, stok — hepsi sipariş anında kontrol ediliyor;
> yarım koli sipariş geçmiyor."

**Vurgu cümlesi:** *"Müşterinin gördüğü fiyat, faturada çıkan fiyattır."*

---

## 3. Çift birim: kasa satılır, kilo konuşulur — 2 dakika

**Ekran:** `/portal` → "Tam Yağlı Beyaz Peynir" (17 kg kasa)

**Yapılacak:** 1 kasa sepete ekle, sepette birim fiyatı göster.

> **Söylenecek:**
>
> "Gıdada fiyat kilodan konuşulur, satış kasadan yapılır. Bu sistemde ikisi ayrı
> tanımlı: peynirin kilosu 214,50 ₺, kasası 17 kilo. Müşteri kasa sipariş
> ediyor, sistem kilo fiyatını çarpıp kasa fiyatını buluyor.
>
> Neden bu önemli: iskonto da, hacim indirimi de, kampanya da doğru sayı
> üzerinden işliyor. 'Kiloda 2 lira indirim' verdiğinizde sistem bunu kasada 2
> lira sanmıyor. Faturada da iki satır birden yazıyor: 17 kg × 214,50 ₺/kg."

---

## 4. Sipariş & onay akışı — 2 dakika

**Ekran:** `/portal` sepet → sipariş ver · sonra `/portal/approvals`

**Yapılacak:**
1. `personel@sahintoptan.local` ile sipariş ver → **onaya düşer**
2. `yonetici@sahintoptan.local` ile onayla

> **Söylenecek:**
>
> "Büyük bayilerde satın almacı sipariş girer, müdür onaylar. Bu firmada onay
> açık: personelin siparişi doğrudan geçmiyor, kendi müdürünün ekranına
> düşüyor. Onay **müşterinin kendi içinde** — size iş çıkmıyor.
>
> Kredi limiti de burada devrede: limit dolmuşsa sipariş reddedilmiyor, onaya
> düşüyor. Kararı siz veriyorsunuz, sistem sizin yerinize müşteriyi
> kaybetmiyor."

---

## 5. Parti & son kullanma — 4 dakika ⭐ *en önemli bölüm*

**Ekran:** `/admin/stok` → "Partiler & son kullanma"

**Yapılacak:**
1. Üstteki özeti göster: kaç parti bozulmuş, kaç parti 30 gün içinde
2. Listenin sırasına dikkat çek — SKT'si en yakın üstte
3. "Mal kabul" ile yeni parti gir (kod boş bırak → sistem üretsin)
4. **Sonra**: bayi hesabıyla o üründen sipariş ver, geri gel → hangi partinin
   düştüğünü göster
5. SKT'si geçmiş partiye "Fire" bas, gerekçe yaz

> **Söylenecek:**
>
> "Şimdi gıdanın asıl meselesi. Depoda aynı üründen üç parti var: biri 9 gün
> sonra bozuluyor, biri 47 gün sonra, biri altı gün önce bozulmuş.
>
> Mal kabulde partiyi ve son kullanma tarihini giriyoruz. Parti kodunu
> yazmayabilirsiniz de — sistem üretiyor. Üretim tarihini yazarsanız, raf
> ömründen son kullanma tarihini kendisi hesaplıyor.
>
> Asıl olan şu: **partiyi kimse seçmiyor.** Müşteri sipariş verdiğinde sistem
> malı son kullanma tarihi en yakın partiden ayırıyor. Buna FEFO deniyor.
> Bakın — siparişte 20 adet istendi, 12 adet 9 gün kalan partiden, 8 adet
> uzun ömürlü partiden çıktı. Depocuya 'önce şunu ver' demek zorunda değilsiniz.
>
> Bozulmuş parti bu sıraya **hiç girmiyor**. Bloke ettiğiniz parti de girmiyor —
> soğuk zinciri şüpheli mal, karantina, numune. Onlar satılmıyor; fire kararı
> sizin.
>
> Ve şu satır önemli: fire, sayımdan ayrı yazılıyor. Sayım 'defter yanılmış'
> demek, fire 'mal gitti' demek. Yıl sonunda bu ikisi ayrı sorulur.
>
> Bir de şu var: hangi siparişe hangi parti gitti, kaydı duruyor. Bir gün
> üretici geri çağırma yaparsa, o partinin hangi bayilere gittiğini tek
> sorguda çıkarıyorsunuz."

**Vurgu cümlesi:** *"Sistemin unutmadığı şeyi, insanın hatırlaması gerekmiyor."*

---

## 6. Plasiyer / saha — 3 dakika

**Ekran:** `/rep` · **Hesap:** `temsilci1@bayraktar.local`
Sonra: `/rep/tahsilat`, `/rep/ziyaret`

**Yapılacak:**
1. Portföy tablosu → bir firmada "Sipariş gir" → katalog o firmanın fiyatıyla açılır
2. Üstteki uyarı şeridini göster ("X firması adına sipariş giriyorsunuz")
3. `/rep/tahsilat` → nakit tahsilat gir → kasaya işlediğini göster
4. `/rep/ziyaret` → haritayı ve sıralı rotayı göster

> **Söylenecek:**
>
> "Plasiyer kendi portföyünü görüyor — başka temsilcinin müşterisini göremiyor,
> sipariş de giremiyor. Bu kısıt sunucuda; ekranı gizlemekle değil.
>
> Müşteri adına sipariş girerken üstte kalıcı bir uyarı duruyor: kimin adına
> giriyor, limiti ne kadar. Yanlış cariye sipariş girmek pahalı bir hatadır;
> ekran bunu gizli bir bilgi olarak tutmuyor.
>
> Tahsilat: nakit, havale, çek, senet, kart. Aldığı para **kasaya** giriyor,
> müşterinin bakiyesinden düşüyor. Çek aldıysa çek portföyüne kaydoluyor,
> vadesi takip ediliyor — karşılıksız çıkarsa borç geri açılıyor.
>
> Yanlış tutar girdiyse: kayıt **silinmiyor**, ters kayıt yazılıyor. Kim,
> ne zaman, ne kadar — hepsi duruyor.
>
> Ziyaret: giriş-çıkış GPS'le. Bayi 'gel' dediğinde plasiyerin gününe
> düşüyor. Harita sıralı rota veriyor."

---

## 7. Mobil uygulama — 2 dakika

**Ekran:** telefon / emülatör

**Yapılacak:** giriş → müşteri listesi → sipariş → barkod okut → tahsilat

> **Söylenecek:**
>
> "Aynı işler telefonda. Bu bir web sayfası değil, kurulan bir uygulama —
> plasiyerin telefonuna APK olarak iniyor.
>
> Üç şeye dikkat: barkod okuyucu ile kamerayla sepete ekliyor. İnternet
> giderse çalışmaya devam ediyor — okuduğu veriler cihazda duruyor, girdiği
> tahsilat kuyruğa giriyor ve bağlantı gelince yükleniyor. Ve düzeltmeler
> uygulama mağazasından geçmeden iniyor.
>
> Sunucu adresi de cihaz ayarı: aynı APK ile hem test hem canlı sisteme
> bağlanabiliyor."

---

## 8. Yönetim & raporlar — 3 dakika

**Ekran:** `/admin` → `/admin/kasa` → `/reports`

**Yapılacak:**
1. `/admin` panosu: bekleyen sipariş, günün tahsilatı
2. `/admin/kasa`: gün sonu
3. `/reports/new`: canlı olarak bir rapor kur — veri kümesi **Parti & son kullanma**, sütun: ürün + SKT + adet, süzgeç: 30 gün içinde
4. Excel'e aktar
5. `/admin/users`: bir kullanıcıya tek tek yetki ver

> **Söylenecek:**
>
> "Rapor kısmında bir şey göstermek istiyorum, çünkü çoğu sistemde olmayan
> şey bu: **raporu ben yazmıyorum, siz kuruyorsunuz.**
>
> Veri kümesini seçiyorsunuz, sütunları seçiyorsunuz, süzgeci koyuyorsunuz.
> Şimdi canlı olarak kuruyorum: 30 gün içinde son kullanma tarihi dolacak
> mallar, ürün ve adet olarak... ve rapor hazır. Kaydediyorum, panoya
> koyuyorum, isterseniz her pazartesi sabahı e-postanıza düşmesini
> söylüyorum. Excel'e ya da PDF'e alıyorsunuz.
>
> Yetkiler de aynı mantıkta: rol değil, tek tek izin. Muhasebeci kasayı görsün
> ama fiyat değiştiremesin — bu bir tik. Ve her değişikliğin kaydı var: kim,
> ne zaman, neyi değiştirdi."

---

## 9. ERP köprüsü — 2 dakika

**Ekran:** `/admin/erp`

> **Söylenecek:**
>
> "Vega'ya dokunmuyoruz. Sizin makinenize küçük bir köprü programı kuruluyor;
> o Vega'yı okuyup buraya taşıyor. Cari, stok, fiyat.
>
> İki kural var. Birincisi: köprü **eşler, oluşturmaz**. Vega'da olmayan bir
> müşteri burada kendiliğinden doğmaz — iki sistemin müşteri listesi ayrışmaz.
>
> İkincisi: senkron stoğu **ezmiyor**, farkı kadar hareket yazıyor. Yani sabah
> gelip 'bu malın stoğu neden düşmüş' dediğinizde cevabı defterde duruyor:
> 'gece ERP senkronu 40 düşürdü' ya da 'şu sipariş çıktı'.
>
> Yarın Vega'dan başka bir ERP'ye geçerseniz köprü değişir, sistem değişmez."

---

## 10. Kapanış — 90 saniye

> **Söylenecek:**
>
> "Toparlayayım. Bu sistem **sizin sunucunuzda** çalışıyor. Veri sizde, ortak
> bir bulutta değil. Kullanıcı başına ücret yok — 10 bayi de bağlasanız 300
> bayi de bağlasanız aynı.
>
> Bugün göstermediğim ama sistemde olan şeyler de var: kampanya motoru,
> kargo etiketi ve fiş basımı, kurye teslim ekranı, hedef takibi, döviz
> fiyatlama, çek-senet portföyü.
>
> Açıkça söyleyeyim: e-fatura GİB'e gönderim bugün yok — belge basılıyor ama
> entegratör bağlantısı ayrı bir iş, çünkü entegratör sözleşmesi sizin adınıza
> yapılıyor. Aynı şekilde kart ile tahsilat için banka sözleşmesi gerekiyor.
> İkisi de teklifte ayrı kalem olarak duruyor.
>
> Teklifi bırakıyorum. İsterseniz önümüzdeki hafta iki bayi ve bir plasiyerle
> pilot kuralım — kendi ürünlerinizle, kendi fiyatlarınızla.
>
> Kurulum bölgeye yapılıyor: merkezin sistemine dokunmuyoruz, fiyat ve ürün
> Vega'dan geliyor. Yani merkezden izin beklemeden başlayabileceğiniz bir iş."

---

## 11. Zor sorular — hazır cevaplar

| Soru | Cevap |
|---|---|
| **"Verilerimiz nerede duruyor?"** | Sizin sunucunuzda, sizin veritabanınızda. Ortak bir bulut örneği yok. İsterseniz kendi ofisinizdeki makineye kurarız. |
| **"Sistem çökerse?"** | Günlük yedek betiği kurulumla geliyor. Geri yükleme tek komut. Yedeği dışarı kopyalamak sizin kontrolünüzde. |
| **"Vega'yı bozar mı?"** | Köprü Vega'ya **yazmıyor**, okuyor. Vega'nın kendi çalışması etkilenmiyor. |
| **"e-Fatura yok mu?"** | Belgeler üretiliyor ve basılıyor. GİB'e gönderim entegratör (EDM/Foriba/Sovos) üzerinden olur; o sözleşme sizin adınıza yapılır. Teklifte ayrı kalem, [45.000] ₺. |
| **"iPhone'da çalışıyor mu?"** | Web tarafı her telefonda çalışıyor. Kurulan uygulama şu an Android; iOS ek kalem. |
| **"Bayilerim kullanmayı bilir mi?"** | Vitrin alışveriş sitesi gibi. Ayrıca plasiyer müşteri adına sipariş girebiliyor — bayi hazır olana kadar akış durmuyor. |
| **"Bu fiyat neden bu kadar?"** | Bu bir abonelik değil, sistemin kendisi sizin oluyor. Aylık 15 bin liralık bir abonelik üç yılda 540 bin eder ve üçüncü yılın sonunda elinizde bir şey kalmaz. |
| **"Kaynak kodu veriyor musunuz?"** | İsterseniz, ek bedelle. Vermesek de sistem sizin sunucunuzda çalışmaya devam eder — bize bağımlı değilsiniz. |
| **"Kaç kişi kullanabilir?"** | Sınırsız. Lisans kullanıcıya değil kuruluma. |
| **"Ne kadar sürede kurulur?"** | Pilot 3 hafta, tam yaygınlaştırma 6 hafta. |

---

## 12. Ekran → adres haritası (tam liste)

### Bayi (müşteri) tarafı
| Ekran | Adres |
|---|---|
| Vitrin / katalog | `/portal` |
| Ürün detayı | `/portal/urun/[id]` |
| Siparişlerim | `/portal/orders` |
| Onay bekleyenler | `/portal/approvals` |
| Cari ekstre | `/portal/statement` |
| Firma kullanıcıları | `/portal/users` |
| Ziyaret çağrısı | `/portal/ziyaret` |
| Hesabım / şifre | `/hesabim` |

### Saha
| Ekran | Adres |
|---|---|
| Plasiyer panosu + portföy | `/rep` |
| Tahsilat | `/rep/tahsilat` |
| Ziyaret & rota | `/rep/ziyaret` |
| Kurye teslim listesi | `/kurye` |

### Yönetim
| Ekran | Adres |
|---|---|
| Pano | `/admin` |
| Ürünler / varyant / fiyat | `/admin/products` |
| Kategoriler | `/admin/categories` |
| **Stok defteri + partiler** | `/admin/stok` |
| Firmalar | `/admin/companies` |
| Cari ekstre (firma) | `/admin/companies/[id]/statement` |
| Kullanıcılar & yetkiler | `/admin/users` |
| Müşteri grupları | `/admin/customer-groups` |
| Kampanyalar | `/admin/promotions` |
| Hacim iskontosu | `/admin/volume-tiers` |
| Ödeme/vade tanımları | `/admin/payment-terms` |
| Kasa & banka | `/admin/kasa` |
| Çek & senet | `/admin/cekler` |
| Belge serileri | `/admin/documents` |
| Etiket & fiş şablonları | `/admin/labels` |
| Dağıtım / kurye atama | `/admin/deliveries` |
| Hedefler | `/admin/targets` |
| Duyurular | `/admin/announcements` |
| Sayfa düzeni | `/admin/sayfa-duzeni` |
| ERP köprüsü | `/admin/erp` |
| Döviz kurları | `/admin/kurlar` |
| Zamanlanmış işler | `/admin/jobs` |
| Denetim kaydı | `/admin/audit` |
| Hareket akışı | `/admin/activity` |
| Sürüm / güncelleme | `/admin/surum` |
| Kuruluş bilgileri | `/admin/organization` |

### Raporlar & belgeler
| Ekran | Adres |
|---|---|
| Rapor listesi | `/reports` |
| Yeni rapor (tasarımcı) | `/reports/new` |
| Panolar | `/reports/dashboards` |
| Sipariş detayı | `/orders/[id]` |
| İrsaliye | `/documents/shipments/[id]` |
| Fatura | `/documents/invoices/[id]` |
| Cari ekstre yazdırma | `/documents/statement/[companyId]` |
| Etiket basımı | `/documents/labels` |

---

## 13. Kayıt sırasında dikkat

- **Ağır ekranı önce aç.** İlk açılışta derleme gecikmesi olur; kayda başlamadan
  her sekmeyi bir kez gez.
- **Fiyat farkını iki hesapla göster** — tek hesapla anlatılan fiyat kuralı
  inandırıcı olmuyor.
- **Parti bölümünde sipariş verip geri dön.** FEFO'yu anlatmak yetmez,
  düşen partiyi göstermek gerekir.
- **Hata gösterme.** Yetersiz stok, limit aşımı gibi ret ekranlarını yalnızca
  "sistem buna izin vermiyor" demek için kullan, üstünde durma.
- **Rakam söyleme.** Fiyat konuşması demodan sonra, teklif üzerinden.
