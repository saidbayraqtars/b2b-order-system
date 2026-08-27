# Ekran görüntüleri

Yenilenen her ekranın görüntüsü burada, ait olduğu adımın klasöründe durur.
Amaç arşiv değil **kıyas**: bir adımı bitirdiğinizde önceki adımların ekranlarını
yan yana açıp aynı arayüze mi baktığınızı görebilmek. Yazıyla "tokenlara geçti"
demek, düğmenin siyah üstüne siyah düştüğünü söylemiyor — görüntü söylüyor.

| Klasör   | Adım                              |
| -------- | --------------------------------- |
| `adim-2` | Portal / vitrin                   |
| `adim-3` | Yönetim çekirdeği                 |
| `adim-8` | Giriş, bayilik başvurusu, hesap   |

## Yeniden üretmek

Görüntüler elle alınmaz; `scripts/screenshots.mjs` üretir. Kayıt defteri
`scripts/screens.mjs` — bir adımı bitirdiğinizde dokunacağınız tek dosya orası.

```bash
# 1. Veritabanı ayakta ve gösterim verisiyle tohumlanmış olsun
#    (pnpm --filter @repo/database db:seed-demo)

# 2. Uygulamayı çalıştırın. `next start` bu depoda işe yaramıyor
#    (next.config: output "standalone"), o yüzden geliştirme sunucusu:
pnpm --filter web dev -- -p 3100

# 3. Görüntüleri alın
SHOT_BASE_URL=http://localhost:3100 pnpm shots            # hepsi
SHOT_BASE_URL=http://localhost:3100 pnpm shots -- --step 3
SHOT_BASE_URL=http://localhost:3100 pnpm shots -- --theme both
```

Tarayıcı indirilmez: sistemde kurulu Chrome ya da Edge sürülür
(`puppeteer-core`). Başka bir yerdeyse `CHROME_PATH` ile gösterin.

## Kararlar

- **Ölçek 1, genişlik 1440.** Görüntü, tasarımcının ekranda gördüğünün birebir
  aynısı. 2x'te tek ekran 3 MB'a çıkıyordu ve depoya her adımda on megabayt
  eklemenin karşılığı yok.
- **Tam sayfa, `fullPage` ile değil.** Pencere sayfanın boyuna büyütülüp öyle
  çekiliyor: kenar çubuğu `sticky` + `h-screen` ve `fullPage` kipinde yalnızca
  ilk ekran boyu kadar boyanıyor, altında beyaz bir şerit kalıyordu.
  6000 pikselden uzun sayfalar kırpılıyor.
- **Kimlikler veritabanından çözülüyor.** Gösterim verisi `cuid` üretiyor ve
  her yeniden tohumlamada değişiyor; kayıt defterine sabit kimlik yazmak
  betiği ilk `db:seed-demo`da bozardı.
- **Giriş form üzerinden.** Oturum çerezi elle üretilmiyor: jeton biçimi
  next-auth'un iç meselesi ve taklit edilirse kimlik doğrulama değiştiğinde
  betik sessizce yanlış ekranı çeker.
- **`as: "anon"` — oturumsuz ekranlar.** Giriş, bayilik başvurusu ve şifre
  sıfırlama için giriş yapılmıyor. Yapılsaydı o ekranlar hiç çekilemezdi:
  oturumu olan bir tarayıcı `/login`e uğramaz, ara katman onu uygulamaya geri
  yollar.
- **Hareket ekranda donmuyor, olduğu yerde yakalanıyor.** Giriş sahnesi sürekli
  hareket ediyor; betik `settle()` sonrası ne görüyorsa onu kaydediyor. Aynı
  ekranın iki çekimi birebir aynı olmayabilir — bu bir hata değil.
- **Açık tema varsayılan.** `--theme dark` ya da `--theme both` ile koyu tema da
  alınır; koyu dosyalar `<slug>-dark.png` olur.
