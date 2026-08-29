# Masaüstü kabuğu

Müşterinin bilgisayarına kurulan `.exe`. Sunucudaki arayüzü kendi penceresinde
açıyor — **kopyasını taşımıyor.**

Karar bu tek cümlede: arayüz sunucudan geldiği için web'e çıkan bir düzeltme
aynı anda masaüstünde de var, kullanıcının indirmesi gereken bir şey yok.
Kabuk yalnızca kabuk: pencere, menü, sunucu adresi, kendi güncellemesi.

Neden tarayıcı yerine uygulama: görev çubuğunda kendi simgesi, adres çubuğu
olmayan bir pencere, çift tıkla açılma ve kendi kendini güncelleme. Müşteri
"programı" istediğinde istediği şey bunlar.

---

## İki ayrı güncelleme, karıştırmayın

| Ne          | Nereden                         | Ne zaman                          |
| ----------- | ------------------------------- | --------------------------------- |
| **Arayüz**  | Sunucudan, her sayfa açılışında | Anında — web'e ne çıktıysa o       |
| **Kabuk**   | `<sunucu>/api/masaustu`         | Açılışta ve 6 saatte bir denetim   |

Kabuk güncellemesi için ayrı bir dağıtım kanalı **kurulmadı**: müşterinin
sunucusu zaten merkezden güncelleniyor (Adım 50), yani satıcı yeni sürümü bir
kez yayımlıyor, sunucu kendini güncelliyor, masaüstü dosyayı o sunucudan
çekiyor. İkinci bir kanal, iki ayrı yerde "hangi sürüm yayında" sorusu demekti.

Müşterinin bilgisayarı yalnızca kendi sunucusuna bağlanıyor — dışarıya değil.

---

## Kullanmak

İlk açılışta tek soru: **sunucu adresi.** Adres denenmeden kaydedilmiyor
(`/api/health` çağrılıyor); yanlış yazılmış bir adres, uygulamayı bir daha
açılmayan bir pencereye çevirir ve kullanıcı hatayı ancak boş ekranda görür.

Adres bir **cihaz ayarı**, paketin parçası değil: aynı `.exe` her müşteriye
gidiyor. `%APPDATA%/B2B/ayarlar.json` içinde durur, menüden
(**Dosya → Sunucu adresi…**) değiştirilir.

Yerel adresler `http`, diğerleri `https` kabul edilir — şema yazmak gerekmez.

---

## Sunucunun önünde parola kapısı varsa

Sunum kurulumunda dış adres bir Basic Auth kapısının arkasında
(`docs/SUNUCU.md`). Tarayıcı 401 görünce kullanıcıya kutu açıyor;
**Electron açmıyor** — dinleyici olmadan istek sessizce düşüyor ve uygulama
"bağlanılamadı" diyor. İlk denemede kapının arkasındaki sunucuya uygulamadan
tek istek ulaşmadı.

Bu yüzden kurulum ekranı, sunucu 401 döndüğünde **kapı kullanıcı
adı/parola** alanlarını açıyor. Kimlik `ayarlar.json`da duruyor ve üç yerde
kullanılıyor: adres denemesi, pencerenin `login` olayı ve güncelleyicinin
istek başlıkları. Üçüncüsü ayrı duruyor çünkü indirmeyi Electron'un ağ
yığını değil, güncelleyicinin kendi isteği yapıyor.

⚑ **Hızlı tünelin adresi her açılışta değişiyor**, yani kurulu uygulamanın
adresi bayatlıyor. Kurulu masaüstü uygulaması olan yerde ya sabit bir adres
(adlandırılmış tünel, `-TunelAdi`) ya da yerel ağ adresi kullanılmalı.

---

## Geliştirme

```bash
pnpm --filter desktop start          # derle + çalıştır (güncelleme kapalı)
pnpm --filter desktop paket          # cikti/ altına .exe üret
pnpm --filter desktop yayimla        # cikti/ → var/masaustu (sunucunun okuduğu yer)
```

`paket` iki dosya üretiyor:

- `B2B-Kurulum-<sürüm>.exe` — NSIS kurulumu. Asıl dağıtılan bu; kısayol koyuyor
  ve güncellemeyi kendisi kuruyor.
- `B2B-Tasinabilir-<sürüm>.exe` — kurulum yapmadan çift tıkla açılan tek dosya.
  Sunumda "kurulum bekleyelim" dakikası olmasın diye. **Güncelleme akışına
  girmiyor** (`yayimla` onu kopyalamıyor): güncelleyici onu kurulum sanardı.

Sürüm numarası `package.json`daki `version`. Yeni sürüm çıkarken orayı
artırmadan `paket` çalıştırmak, güncelleyicinin görmeyeceği bir dosya üretir.

### Yayımlama

```bash
# 1) sürümü artır (apps/desktop/package.json)
pnpm --filter desktop paket
pnpm --filter desktop yayimla        # ya da: yayimla -- "D:/sunucu/var/masaustu"
# 2) sunucuda doğrula
curl https://siparis.musteri.com/api/masaustu
```

Sunucu tarafı: `DESKTOP_RELEASE_DIR` klasörünü `/api/masaustu` altında servis
ediyor, **yalnızca** `.yml`, `.exe`, `.blockmap`, `.zip` uzantılarını. Dizin
listesi vermiyor. Üretimde bu klasör kapsayıcıya salt okunur bağlanıyor
(`docker-compose.prod.yml`).

---

## Bilerek yapılmayanlar

- **Kod imzası yok.** Sertifika alınana kadar Windows SmartScreen ilk açılışta
  "bilinmeyen yayımcı" uyarısı gösterecek; müşteriye kurulumdan önce
  söylenmeli. Uyarıyı gizlemenin başka yolu yok.
- **Ana pencerede preload yok.** Uzak sayfa `kabuk.*` köprüsünü göremiyor:
  sunucudan gelen bir sayfaya, ne kadar güvenilse de, ayar yazma yetkisi
  verilmez. Kurulum ekranı yerel bir dosya ve köprüyü yalnızca o taşıyor.
- **Çevrimdışı çalışmıyor.** Sunucu kapalıysa uygulama "bağlanılamadı"
  ekranını gösteriyor. Kabuğun içinde bir kopya olmadığı için gösterecek başka
  bir şey de yok — bu, mimarinin bedeli ve bilerek ödendi.
- **macOS/Linux paketi yok.** Hedef Windows; istenirse `electron-builder`
  yapılandırmasına eklenir.
