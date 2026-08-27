# Ekran görüntüleri

Yenilenen her ekranın görüntüsü burada, ait olduğu adımın klasöründe durur.
Amaç arşiv değil **kıyas**: bir adımı bitirdiğinizde önceki adımların ekranlarını
yan yana açıp aynı arayüze mi baktığınızı görebilmek. Yazıyla "tokenlara geçti"
demek, düğmenin siyah üstüne siyah düştüğünü söylemiyor — görüntü söylüyor.

| Klasör    | Adım                            |
| --------- | ------------------------------- |
| `adim-2`  | Portal / vitrin                 |
| `adim-3`  | Yönetim çekirdeği               |
| `adim-4`  | Finans                          |
| `adim-5`  | Operasyon                       |
| `adim-6`  | Yapılandırma ve sistem          |
| `adim-7`  | Rapor tasarımcısı ve panolar    |
| `adim-8`  | Giriş, bayilik başvurusu, hesap |
| `adim-11` | Saha üçlüsü ve kök              |

## Yeniden üretmek

Görüntüler elle alınmaz; `scripts/screenshots.mjs` üretir. Kayıt defteri
`scripts/screens.mjs` — bir adımı bitirdiğinizde dokunacağınız tek dosya orası.

```bash
# 1. Veritabanı ayakta ve gösterim verisiyle tohumlanmış olsun
#    (pnpm --filter @repo/database db:seed-demo)

# 2. Uygulamayı çalıştırın. `next start` bu depoda işe yaramıyor
#    (next.config: output "standalone"), o yüzden geliştirme sunucusu.
#    `--` KOYMAYIN: pnpm 9 onu komuta aynen geçiriyor ve next onu bir dizin
#    adı sanıyor ("Invalid project directory provided, no such directory: …\-p").
pnpm --filter web dev -p 3100

# 3. Görüntüleri alın. Burada da `--` KOYMAYIN: pnpm 9 onu betiğe aynen
#    geçiriyor ve betik "Bilinmeyen argüman: --" deyip duruyor.
SHOT_BASE_URL=http://localhost:3100 pnpm shots            # hepsi
SHOT_BASE_URL=http://localhost:3100 pnpm shots --step 3
SHOT_BASE_URL=http://localhost:3100 pnpm shots --theme both
```

Tarayıcı indirilmez: sistemde kurulu Chrome ya da Edge sürülür
(`puppeteer-core`). Başka bir yerdeyse `CHROME_PATH` ile gösterin.

> **Sunucu ayaktayken `next build` çalıştırmayın.** İkisi aynı `.next`
> klasörünü paylaşıyor; derleme, geliştirme sunucusunun sunduğu CSS/JS
> parçalarını yerinden ediyor ve sunucu ölmeden çalışmaya devam ediyor —
> tarayıcı o parçaları 404 alıyor, sayfa **ham HTML** olarak açılıyor. Adım
> 4'te altı ekranın altısı da böyle kaydedildi: mavi altı çizili bağlantılar,
> kutusuz form, Times New Roman. Olduysa: sunucuyu durdurun,
> `rm -rf apps/web/.next`, sunucuyu yeniden başlatın, çekimi tekrarlayın.
>
> Betik artık bunu kendisi yakalıyor (`assertStyled`, aşağıda) ama önce
> derlemeyi ayrı sırada çalıştırmak daha ucuz.

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
- **Sekme URL'de olmayan ekran fotoğraflanamaz.** Betik bir adrese gidip
  resmini çekiyor; düğmelere basmıyor, sekme değiştirmiyor. Bu yüzden stok
  defterinin dört sekmesi `?bolum=` ile adresleniyor ve dördü ayrı ayrı
  kaydediliyor. Bir ekranın parçasını yalnızca tıklayarak görülebilir kılmak,
  o parçanın doğru göründüğünü söyleyememek demek — yeni ekranlarda sekme ya da
  kip eklerken bunu hesaba katın.
- **Yazdırma yüzeyleri de çekiliyor.** `documents/**` tasarım dilinin renk ve
  koyu tema kurallarının dışında (kâğıt her zaman beyaz). Görüntüleri yine de
  alınıyor: kuralın dışında olduğunu görebilmenin tek yolu yan yana koymak.
- **Hareket ekranda donmuyor, olduğu yerde yakalanıyor.** Giriş sahnesi sürekli
  hareket ediyor; betik `settle()` sonrası ne görüyorsa onu kaydediyor. Aynı
  ekranın iki çekimi birebir aynı olmayabilir — bu bir hata değil.
- **Açık tema varsayılan.** `--theme dark` ya da `--theme both` ile koyu tema da
  alınır; koyu dosyalar `<slug>-dark.png` olur.
- **3000 pikselden uzun bir dosya bir bulgudur.** Kırpma sınırı 6000 ve betik
  sessizce kırpıyor; Adım 4, 5 ve 6'da üç kez aynı şey çıktı — sınırlanmamış bir
  liste sayfayı uzatıyor ve altındaki dipnot, sayfalama düğmesi ya da panel hiç
  görünmüyor. Çekimden sonra dosya boylarına bakın:

  ```bash
  python -c "import struct,glob;[print(struct.unpack('>II',open(f,'rb').read(24)[16:24])[1],f) for f in sorted(glob.glob('docs/design/screens/adim-6/*.png'))]"
  ```

- **Biçimsiz sayfa kaydedilmez** (`assertStyled`). Boş bir ekran kaydetmek
  serbest — boş ekran da bir ekrandır — ama **stilsiz** bir ekran kaydetmek
  betiğin tek işini boşa çıkarıyor. İki ölçüt, ikisi de temadan bağımsız:
  sayfada hiç stil sayfası olmaması (`document.styleSheets.length === 0`) ve
  `body`nin tarayıcı varsayılanı 8px kenar boşluğunu taşıması — Tailwind'in
  sıfırlaması onu 0'a çekiyor. Ham HTML `{sheets: 0, margin: "8px"}` veriyor,
  sağlam sayfa `{sheets: 1, margin: "0px"}`.
