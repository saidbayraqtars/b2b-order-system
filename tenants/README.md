# Kiracı klasörleri

Her müşteri firma **kendi kurulumunda** çalışır (kendi sunucusu ya da onun için
aldığımız hosting). Bu klasör, bir kurulumu o firmaya ait yapan her şeyi tutar.

```
tenants/
  demo/                 depoyla gelen örnek — geliştirme bunu kullanır
    tenant.json         satıcı kimliği, marka dosyalarının yolları
    branding/           logo, favicon, fontlar
  <müşteri-slug>/       gerçek müşteri klasörleri — depoya girmez
```

## Kural: dosya kaynaktır, veritabanı değil

Klasör, **desteğin birimi**dir: alınır, elle düzenlenir, geri gönderilir. Aynı
bilgiyi veritabanında da tutsaydık ikisi kaçınılmaz olarak ayrışırdı — müşteri
dosyayı düzenler, ekranda hiçbir şey değişmezdi. Bu yüzden tek kaynak dosyadır.

`tenant.json` dosyanın değişme zamanına (mtime) göre önbelleklenir: dosyayı
düzenleyip sayfayı yenilemek değişikliği görmeye yeter, sunucuyu yeniden
başlatmak gerekmez.

## Kurulum hangi klasörü kullanacağını nereden bilir

`TENANT_DIR` ortam değişkeninden. **Varsayılan yoktur.** Fatura basan bir sistem,
kimin adına bastığını bilmiyorsa başkasının adına basmaktansa durmalıdır — bu
yüzden değişken tanımsızsa açık bir hata verir.

```bash
# geliştirme (apps/web içinden çalıştığı için göreli yol)
TENANT_DIR=../../tenants/demo

# üretim
TENANT_DIR=/srv/b2b/tenant
```

## Yeni müşteri açmak

```bash
cp -r tenants/demo tenants/acme
# tenant.json içindeki slug + seller bilgilerini gerçek firmayla değiştir
# branding/logo.svg yerine müşterinin logosunu koy
```

`demo` dışındaki klasörler `.gitignore`'da: gerçek bir müşterinin unvanı, VKN'si
ve logosu onun verisidir, ortak depoya girmez.

## Ödeme sağlayıcısı — seçim burada, anahtar burada değil

```json
"payment": {
  "provider": "manual",
  "installments": [],
  "autoCapture": false
}
```

`provider`, kayıt defterindeki anahtardır. Kutudan `manual` çıkar: entegrasyon
yok, tezgâhtaki POS cihazından çekim yapılır ve `/admin/kasa` ekranından
onaylanır. Para kasaya **ancak o onayla** girer — sipariş kaydedildi diye değil.

**Anahtarlar ve sırlar bu dosyaya yazılmaz.** Bu klasör destek akışının taşıma
birimidir: elden ele gider, e-postayla gönderilir, yedeklenir. Buraya yazılan bir
API anahtarı o yolculukların hepsine katılır ve gönderen kişiden uzun yaşar.
Sırlar ortam değişkeninden okunur:

```bash
PAYMENT_<SAĞLAYICI>_<AD>=...
# örn. PAYMENT_IYZICO_API_KEY, PAYMENT_IYZICO_SECRET
```

Her sağlayıcının ihtiyacı farklı olduğu için ad listesi sabit değil; adaptör
neye ihtiyacı varsa onu okur ve eksikse kendi hatasını verir.
