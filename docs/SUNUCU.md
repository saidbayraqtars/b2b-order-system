# Bu makineyi geçici sunucu yapmak

Sunum ve deneme için: tek tık, bütün sistem ayakta. Kalıcı müşteri kurulumu bu
değil — o [`DEPLOYMENT.md`](../DEPLOYMENT.md)'de (Docker imajı, göç kapsayıcısı,
yedek, güncelleme).

|                 | Bu belge                              | `DEPLOYMENT.md`               |
| --------------- | ------------------------------------- | ----------------------------- |
| Ne için         | Sunum, video kaydı, uzaktan gösterim  | Müşteri kurulumu              |
| Ne kadar sürer  | ~20 saniye                            | Bir yarım gün                 |
| Ne kadar yaşar  | Kapatana kadar                        | Kalıcı                        |
| Derleme         | Geliştirme sunucusu                   | Üretim imajı                  |
| Dış erişim      | Geçici tünel (adres her açılışta yeni) | Alan adı + TLS + ters vekil   |

---

## Tek tık

Depo kökünde:

- **`SUNUCU BASLAT.bat`** — hepsini ayağa kaldırır
- **`SUNUCU DURDUR.bat`** — hepsini kapatır

Başlatıcı sırayla şunları yapıyor ve her adımın bittiğini **doğruluyor**:

1. Docker Desktop kapalıysa açar, Postgres kapsayıcısını başlatır, `pg_isready`
   cevap verene kadar bekler
2. Şema göçünü uygular; veritabanı **boşsa** gösterim verisini yükler (doluysa
   dokunmaz — ikinci kez tohumlamak siparişleri ikiye katlardı)
3. Dış erişim tünelini açar ve önüne parola kapısı koyar
4. Uygulamayı başlatır, `/api/health` `"ok"` diyene kadar bekler
5. 15 ekranı önceden derler (sunumda ilk tık 20 saniye beklemesin diye)
6. Güvenlik duvarı kuralını kontrol eder (aynı wifi'deki telefon için)
7. QR kodlu bağlantı sayfasını açar ve dış adresi panoya kopyalar

Sonunda üç adres yazıyor:

```
Bu makine     : http://localhost:3000
Ayni wifi     : http://192.168.1.6:3000
Disaridan     : https://xxx-yyy-zzz.trycloudflare.com
Parola        : demo / 5rnagbmj
```

## Seçenekler

```powershell
.\scripts\sunucu.ps1                 # varsayılan: dış erişim + parola kapısı
.\scripts\sunucu.ps1 -YerelSadece    # tünel açma; yalnız bu makine ve wifi
.\scripts\sunucu.ps1 -Parolasiz      # dış adres parola sormasın (dikkat)
.\scripts\sunucu.ps1 -Parola "abc"   # parolayı sen seç
.\scripts\sunucu.ps1 -Pencereler     # bitince 10 gösterim penceresini de aç
.\scripts\sunucu.ps1 -TunelAdi b2b -DisAdres https://b2b.firmaniz.com   # sabit adres
.\scripts\sunucu.ps1 -Port 3200      # başka port
.\scripts\sunucu.ps1 -Durum          # ne çalışıyor
.\scripts\sunucu.ps1 -Durdur         # kapat
```

`.bat` dosyasına da geçiyor: `SUNUCU BASLAT.bat -YerelSadece`.

`-Pencereler`, [`demo-windows.ps1`](../scripts/demo-windows.ps1)'i çağırıyor:
on ayrı Chrome penceresi, her biri kendi profilinde ve kendi hesabıyla açık
(patron, plasiyer, kurye, üç bayi…). Sunumda Alt+Tab ile geziliyor.

---

## Üç adres, üç kullanım

**`localhost:3000`** — bu makinede sunum yaparken. En hızlısı.

**`192.168.1.x:3000`** — aynı wifi'deki telefon, tablet, ikinci makine.
**Mobil uygulamanın sunucu adresi olarak da bu giriliyor** (uygulamada bir cihaz
ayarı). QR sayfasındaki karekod bunu taşıyor, telefona elle yazılmıyor.

İlk seferde Windows Güvenlik Duvarı kuralı gerekiyor; betik yönetici olarak
çalıştırılmışsa kendisi ekliyor, değilse komutu yazıyor.

**`xxx.trycloudflare.com`** — müşteri kendi ofisinden bakacaksa. Cloudflare'ın
hızlı tüneli: hesap istemiyor, adres **her açılışta değişiyor** ve sunucu
kapanınca ölüyor.

---

## Dış erişimin parola kapısı

Dış adres rastgele ama **herkese açık**, ve bu kurulumdaki gösterim
hesaplarının şifresi herkese açık depoda yazılı (`DEMO-KULLANICILAR.md`).
Adresi bir kez paylaştıktan sonra o adres nereye giderse gitsin, arkasında
patron yetkisiyle girilebilen bir sistem duruyor.

Bu yüzden dış erişim varsayılan olarak bir Basic Auth kapısının arkasında:
[`scripts/kapi.mjs`](../scripts/kapi.mjs), bağımlılıksız, yalnızca 127.0.0.1'i
dinliyor, tünel ona bakıyor, o uygulamaya. Parola her açılışta yeniden
üretiliyor ve ekrana yazılıyor.

Müşteriye iki şey gönderiyorsun: adres ve `demo / <parola>`.

**Sunum bitince `SUNUCU DURDUR.bat`.** Tünel kapanır, adres ölür.

### Masaüstü uygulaması kapının arkasından girebiliyor mu

Evet, ama parolayı **uygulamaya da yazmak gerekiyor**. Tarayıcı 401 görünce
kullanıcıya kutu açıyor; Electron açmıyor. Kurulum ekranı sunucu parola
istediğinde **kapı kullanıcı adı/parola** alanlarını kendiliğinden açıyor;
oraya `demo` ve ekranda yazan parola giriliyor. Güncelleyici de aynı kimliği
kullanıyor.

⚑ **Hızlı tünel adresi her açılışta değişiyor.** Bir sunum için sorun değil,
ama kurulu masaüstü uygulaması olan bir kullanıcı her seferinde adresi
yeniden yazmak zorunda kalır. **Sabit adres** için adlandırılmış tünel
gerekiyor (Cloudflare hesabı + kendi alan adınız):

```powershell
# bir kez:
cloudflared tunnel login
cloudflared tunnel create b2b
cloudflared tunnel route dns b2b b2b.firmaniz.com
#   ~/.cloudflared/config.yml → service: http://127.0.0.1:3010   (parola kapısı)
#                                     ya da http://127.0.0.1:3000  (-Parolasiz)

# her açılışta:
.\scripts\sunucu.ps1 -TunelAdi b2b -DisAdres https://b2b.firmaniz.com
```

Alan adınız yoksa: sunumda hızlı tünel + tarayıcı yeterli; masaüstü
uygulamasını **aynı wifi adresiyle** (`192.168.…`) kullanın — o adres
değişmiyor.

---

## Sık karşılaşılanlar

| Belirti                                    | Sebep / çözüm                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| "Docker acilmadi"                          | Docker Desktop'ı elle açıp betiği tekrar çalıştırın                                                       |
| Tünel adresi okunamadı                     | `var/tunel.log.err`e bakın; kurumsal ağ QUIC'i kapatmış olabilir                                          |
| Dış adres 502                              | Uygulama henüz derleniyor; 10 saniye sonra yenileyin                                                      |
| Telefondan `192.168...` açılmıyor          | Güvenlik duvarı kuralı yok (yukarıdaki komut), ya da telefon başka ağda                                   |
| Gösterim giriş düğmeleri yok               | Üretim derlemesi çalışıyor. Bu betik geliştirme sunucusu başlatır; başkası 3000'i tutuyorsa onu kapatın   |
| Ekranlar boş                               | Veritabanı boş kalmış: `pnpm --filter @repo/database db:seed-demo`                                        |
| Laptop uyudu, adres öldü                   | Uyku tüneli koparıyor. Sunum boyunca güç ayarını "hiç uyuma" yapın                                        |
| Bilgisayar kapandı                          | Otomatik başlamıyor — bilerek. Açılışta kendiliğinden dış dünyaya açılan bir kurulum istemiyoruz          |

Günlükler `var/` altında: `web.log`, `tunel.log`, `kapi.log` (ve `.err` eşleri).

---

## Sınırlar — bunun bir üretim kurulumu olmadığı yerler

- **Geliştirme derlemesi.** Sayfalar ilk açılışta derleniyor; betik 15 ekranı
  ısıtıyor ama listede olmayan bir ekrana ilk gidişte 5–15 saniye gecikme olur.
- **Gösterim girişi açık.** `/login` sayfasında tek tıkla giriş düğmeleri var.
  Gerçek kurulumda bu blok üretim derlemesinde koda hiç girmiyor.
- **Veritabanı şifresi `postgres`.** Geliştirme kapsayıcısı; dışarı yalnızca
  5433 portu ve yalnızca bu makinede açık.
- **Yedek yok.** Bu veri gösterim verisi; gerçek veri buraya girmemeli.
- **Tek makine.** Laptop kapanınca sistem kapanır.

Müşteri "biz bunu kullanmaya başlayalım" derse burada durulmuyor:
`DEPLOYMENT.md`deki kurulum yapılıyor, çünkü orada yedek, güncelleme, TLS ve
gerçek şifreler var.
