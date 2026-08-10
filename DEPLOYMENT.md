# Kurulum ve İşletim

Bu sistem **her müşteri için ayrı kurulur**: kendi sunucusu, kendi veritabanı,
kendi kiracı klasörü. Ortak bir bulut örneği yok, `tenantId` yok. Bu dosya bir
kurulumun nasıl açıldığını, nasıl güncellendiğini ve nasıl geri alındığını
anlatır.

Geliştirme ortamı için `README.md`; özellik envanteri için `FEATURES.md`.

---

## 1. Gereksinimler

| Ne | Sürüm | Not |
|---|---|---|
| Linux sunucu | — | 2 vCPU / 4 GB RAM küçük bir bayi ağı için yeterli |
| Docker Engine | 24+ | `docker compose` v2 eklentisiyle |
| Ters vekil | nginx / Caddy / Traefik | TLS'i o sonlandırır, uygulama düz HTTP dinler |
| Alan adı | — | `APP_URL` ile aynı olmalı |

Uygulama **root olmayan** kullanıcıyla çalışır ve veritabanı portunu dışarı
açmaz. Dışarıya bakan tek şey web portudur (varsayılan 3000), onun da önünde
vekil olması beklenir.

---

## 2. İlk kurulum

```bash
git clone <depo> /opt/b2b && cd /opt/b2b

cp .env.production.example .env.production
chmod 600 .env.production
$EDITOR .env.production          # aşağıdaki tabloya bakın

mkdir -p tenants/musteri         # kiracı klasörü — bkz. tenants/README.md
$EDITOR tenants/musteri/tenant.json

./scripts/install.sh
```

`install.sh` sırayla: yapılandırmayı doğrular → imajları derler → veritabanını
açar → şemayı kurar → yönetici hesabını sorar → web'i başlatır → sağlığı
bekler. Herhangi bir adım düşerse orada durur; yarım kurulum dışarıya açılmaz.

### Doldurulması zorunlu değişkenler

| Değişken | Neden zorunlu |
|---|---|
| `POSTGRES_PASSWORD` | Boşsa Compose başlamaz (şifresiz veritabanı açılmasın diye) |
| `DATABASE_URL` | Sunucu adı `db`, `localhost` değil — Compose ağındaki servis adı |
| `AUTH_SECRET` | Oturum ve mobil jeton imzası. `openssl rand -base64 33` |
| `APP_URL` | E-postadaki bağlantılar buradan üretilir; https olmalı |
| `TENANT_SOURCE` | Bu kurulumun hangi firmaya ait olduğu — fatura başlığı buradan |

Eksik olan varsa süreç **açılışta** durur (`src/instrumentation.ts`). Sistem
ayakta görünüp ilk gerçek istekte patlamaz.

### `seed.ts` üretimde çalıştırılmaz

`pnpm db:seed` geliştirme verisidir: `admin@b2b.local` / `Password123!` dahil,
şifresi depoda yazılı hesaplar açar. Müşteri sunucusunda kullanılan
`prisma/bootstrap.ts`'tir (install.sh çağırır) — tek bir gösterim satırı
yazmaz, yalnızca operatörün verdiği şifreyle bir süper admin, belge serileri ve
hazır etiket tasarımları.

---

## 3. Günlük işletim

```bash
cd /opt/b2b
C="docker compose --env-file .env.production -f docker-compose.prod.yml"

$C ps                    # servis durumu
$C logs -f web           # canlı günlük
$C restart web
curl -s localhost:3000/api/health | jq
```

### Sağlık ucu

`GET /api/health` kimlik istemez ve yalnızca evet/hayır döner:

```json
{ "status": "ok", "version": "3dc58df",
  "checks": { "database": true, "tenant": true, "uploads": true, "config": true } }
```

`status` "ok" değilse HTTP 503 döner. Anlamları:

- **database** — veritabanına ulaşılamıyor **ya da** yarım kalmış migration var
- **tenant** — `tenant.json` okunamıyor/geçersiz; belge basılamaz
- **uploads** — `UPLOAD_DIR` yok ya da yazılamıyor; görsel yüklenemez
- **config** — üretimde zorunlu bir ortam değişkeni eksik

Neden düştüğü **kasten** yazılmaz: hata metni bağlantı dizesi ve dosya yolu
sızdırır. Ayrıntı sunucu günlüğünde.

---

## 4. Yedekleme

```bash
./scripts/backup.sh                  # backup/<zaman-damgası>/
RETAIN_DAYS=30 ./scripts/backup.sh   # varsayılan 14 gün
```

Üçü birlikte alınır — veritabanı (`pg_dump -Fc`), yüklenen görseller ve kiracı
klasörü. Yalnız veritabanı yedeği geri yüklendiğinde görselleri kırık, fatura
başlığı boş bir sistem verir.

Günlük yedek için crontab:

```cron
0 3 * * * cd /opt/b2b && ./scripts/backup.sh >> /var/log/b2b-backup.log 2>&1
```

Yedekler **aynı diskte** duruyor. Disk arızası ikisini birden götürür; dizini
dışarı kopyalayan bir işi (rsync/rclone/S3) ayrıca kurun.

### Geri yükleme

```bash
./scripts/restore.sh backup/20260807-141500
```

Mevcut veritabanını **siler** ve yedektekiyle değiştirir; `--force`
verilmedikçe onay ister. Kiracı klasörünü kendiliğinden açmaz — hedef yol
kurulumdan kuruluma değişiyor ve yanlış yere açmak fatura başlığını bozar.

---

## 5. Güncelleme ve geri alma

```bash
GIT_PULL=1 ./scripts/update.sh
```

Sıra: yedek → imaj derle → **şema göçü** → web'i yeni sürüme geçir → sağlığı
bekle. Sağlık `HEALTH_TIMEOUT` (varsayılan 120 sn) içinde gelmezse eski imaja
döner.

Sağlık kontrolü yalnızca 200'e bakmaz, `version` alanının yeni sürüme
eşitliğine de bakar: hâlâ eski kopyaya cevap veren bir sunucu "güncelleme
başarılı" sanılmasın.

> **Şema göçü geri alınamaz.** Betiğin geri alması *uygulama sürümüdür*. Yeni
> sürüm bir kolon düşürdüyse eski imaja dönmek onu geri getirmez; o durumda
> çare yedektir. `SKIP_BACKUP=1` bu yüzden vardır ve bu yüzden varsayılan
> değildir.

Göç başarısız olursa betik **web'e hiç dokunmadan** durur: eski sürüm çalışmaya
devam eder, şema da eskidir. Güncellemenin en güvenli durma noktası orasıdır.

### Sürüm adı

`update.sh` sürümü `git describe --tags --always --dirty` ile üretir; imaj
etiketi, `/api/health`in döndürdüğü değer ve geri alma hedefi hep aynı dizedir.
Etiketli bir sürüme geçildiğinde kurulum kendini `v1.4.0` diye tanıtır — merkezî
akış sürümleri etiket adıyla duyurduğu için bu eşitlik şart.

---

## 5b. Merkezden güncelleme (ajan)

Elli kurulumu tek tek elle güncellemek sürdürülebilir değil. Ajan
(`scripts/agent.sh`) satıcının yayımladığı **sürüm akışına** bakar, kurulumun
sürümüyle karşılaştırır ve politikaya göre ya yalnızca ekranda gösterir ya da
bakım penceresinde güncellemeyi kendisi uygular.

### Merkez bir sunucu değil

Akış statik bir JSON dosyasıdır (S3, statik site, kendi alan adınız) ve yön tek
taraflıdır: **sunucular okur, merkez hiçbir sunucuya bağlanmaz.** Müşteri
sunucularına komut geçirebilen merkezî bir kontrol paneli, ele geçirildiğinde
elli kurulumda birden kod çalıştırma imkânı olurdu.

Akış **yalnızca bir git etiketinin adını** söyler; kod her zaman kurulumun kendi
`origin`'inden gelir. Akışı ele geçirmek kod çalıştırmaya yetmez — saldırganın
ayrıca depoya yazabiliyor olması gerekir. İki kilit daha: etiket adı katı bir
karakter kümesinden geçmeden `git`e verilmez, ve `UPDATE_REQUIRE_SIGNED_TAG=1`
ile etiketin GPG imzası doğrulanır.

### Akış biçimi

Kanal başına ayrı ve **düz** dosya — `<UPDATE_FEED_URL>/<kanal>.json`:

```json
{
  "schema": 1,
  "version": "v1.4.0",
  "releasedAt": "2026-08-11T09:00:00+03:00",
  "mandatory": false,
  "notes": "Tek satır özet",
  "notesUrl": "https://ornek/surum-notlari"
}
```

İç içe yapı yok: müşteri sunucusunda `jq` olduğunu varsayamayız, ajanın
bağımlılığı `sh` + `git` + `docker` ile sınırlı. `notes` bu yüzden tırnak ve
satır sonu içeremez; `release.sh` bunu yayımlarken reddeder, uzun metin
`notesUrl`de durur.

### Yayımlama (satıcının makinesinde)

```bash
git tag -a v1.4.0 -m "Sürüm özeti"
git push origin v1.4.0
./scripts/release.sh v1.4.0 --mandatory --notes-url https://...
# dist/feed/stable.json → akış adresine kopyalayın
```

Betik dosyayı **yazar, yayına almaz**. Kopyalama ayrı ve kasıtlı bir adım: bir
betiğin sonunda kazara elli kuruluma sürüm duyurulmasın diye. Etiket `origin`'de
yoksa yayımlamayı reddeder — duyurulan ama gönderilmemiş bir etiket, her
kurulumda "etiket depoda yok" hatası demektir.

### Kurulum (müşteri sunucusunda)

```bash
sudo cp deploy/b2b-update.service deploy/b2b-update.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now b2b-update.timer
```

`.env.production` içinde: `UPDATE_FEED_URL`, `UPDATE_CHANNEL`, `UPDATE_POLICY`,
`UPDATE_WINDOW`, `UPDATE_STATE_DIR`, `UPDATE_STATE_FILE`.

| Politika | Ne yapar |
|---|---|
| `off` | Akışa bakmaz |
| `notify` | Bakar, ekranda gösterir, **dokunmaz** — varsayılan |
| `auto` | Bakım penceresinde kendisi günceller |

Varsayılan bilerek `notify`: müşterinin ERP'ye bağlı sipariş sistemini haberi
olmadan yeniden başlatan bir yazılım, kazandığından çok güven kaybettirir.

Ajanın uygulamadan önce baktığı üç şart:

1. **Bakım penceresi** içinde olmalı (`UPDATE_WINDOW`, sunucunun yerel saati).
2. **Kurulum sağlıklı** olmalı. Yarım kalmış bir göçün üstüne yeni sürüm koymak
   teşhisi imkânsız hâle getirir; operatör önce neden bozuk olduğunu görmeli.
3. **Çalışma ağacı temiz** olmalı. Sunucuda elle düzenlenmiş bir dosya varsa
   `git checkout` onu ezerdi ve kaybolanın ne olduğunu kimse bilemezdi.

Elle çalıştırma: `./scripts/agent.sh --check` (yalnızca bak),
`./scripts/agent.sh --now` (pencere ve politika dinlemeden şimdi güncelle).

### Sürüm ekranı

`/admin/surum` — çalışan sürüm, kanalın yayımladığı sürüm, son kontrol zamanı ve
son güncelleme denemesinin sonucu. **Salt okunur ve bilerek öyle:** web bir
kapsayıcının içinde ve orada `git` de `docker` da yok. Erişebilsin diye docker
soketi kapsayıcıya bağlansaydı, uygulamada bulunacak herhangi bir açık host'ta
root'a çıkardı. Bir "Güncelle" düğmesinin bedeli budur; düğme yoktur.

Ekran ajanın bıraktığı durum dosyasını okur, akışa kendi bakmaz: güncellemeyi
uygulayacak olanın gördüğü şey neyse ekranda o yazmalı. Ajan bir günden uzun
süredir susuyorsa ekran "güncel" demez, **"ajan susuyor"** der — ölmüş bir
ajanın "güncelsiniz" cevabı, aylarca yamasız kalan kurulum demektir.

> Durum dosyası web'e **dizin olarak** bağlanır (`UPDATE_STATE_DIR` → `/data/state`).
> Ajan dosyayı geçici ada yazıp taşıyarak günceller; bind ile bağlanan tek bir
> *dosya* eski inode'a takılı kalır ve taşımadan sonra bir daha hiç değişmez.

---

## 6. İmaj yapısı

`Dockerfile` iki hedef üretir:

- **runner** (varsayılan) — Next standalone çıktısı. Yalnızca izlenmiş
  dosyalar, `node` kullanıcısı, `prisma` CLI ve migration dosyaları **yok**.
- **migrator** — derleme katmanının üstünde; `prisma migrate deploy` çalıştırıp
  çıkar. `bootstrap.ts` de bu kapsayıcıdan koşar.

Göç ayrı servis olduğu için web'in iki kopyası aynı anda başlatıldığında ikisi
birden şemaya girmez. Compose'da web, `migrate` servisinin
`service_completed_successfully` koşuluna bağlıdır: göç bitmeden başlamaz,
göç düşerse hiç başlamaz.

### Kalıcı veri

| Ne | Nerede | Not |
|---|---|---|
| Veritabanı | `b2b_pgdata` birimi | |
| Yüklenen görseller | `b2b_uploads` birimi → `/data/uploads` | `UPLOAD_DIR` ile eşleşir |
| Kiracı klasörü | host'taki `TENANT_SOURCE` → `/data/tenant` | **salt okunur** bağlanır |

İmajın içinde kalıcı hiçbir şey yok; güncelleme kapsayıcıyı değiştirir, veriyi
değil.

---

## 7. Ters vekil örneği (nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name siparis.musteri.com.tr;

  ssl_certificate     /etc/letsencrypt/live/siparis.musteri.com.tr/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/siparis.musteri.com.tr/privkey.pem;

  # Ürün görseli ve teslim kanıtı fotoğrafı yükleniyor; varsayılan 1 MB az.
  client_max_body_size 12m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

`X-Forwarded-For` başlığı zorunlu: giriş denemesi sınırı IP'ye göre sayıyor ve
başlık gelmezse tüm dünya tek IP gibi görünür — bir kullanıcının hatalı şifresi
herkesi kilitler.

---

## 8. Sorun giderme

| Belirti | Bakılacak yer |
|---|---|
| Kapsayıcı sürekli yeniden başlıyor | `logs web` → büyük olasılıkla eksik ortam değişkeni (`EnvError`) |
| `/api/health` → `tenant: false` | `TENANT_SOURCE` yolu, `tenant.json` biçimi |
| `/api/health` → `database: false` | `DATABASE_URL`, `migrate` servisinin çıktısı, yarım kalmış migration |
| Görsel yüklenmiyor | `uploads: false` → birim bağlanmamış ya da sahiplik yanlış |
| E-posta gitmiyor | `SMTP_HOST` boş → günlüğe yazılıyor; açılışta uyarı basılır |
| Mobil giriş çalışmıyor | `AUTH_SECRET` değişmiş olabilir — değişince tüm jetonlar geçersiz olur |

---

## 9. Bu adımda kapanmayanlar

- ~~**Merkezden güncelleme yok.**~~ Kapandı: sürüm akışı + ajan + sürüm ekranı
  (bölüm 5b).
- **Filo görünümü yok.** Ajan kurulumun durumunu kendi diskine yazar; "hangi
  müşteri hangi sürümde" sorusunu tek ekranda cevaplayan merkezî bir liste yok.
  Bunun için kurulumların merkeze rapor vermesi gerekir — yani merkezin bir
  sunucuya dönüşmesi ve her kurulumdan gelen isteği kimliklendirmesi. Ayrı bir
  iş; akışın tek yönlü kalması bilinçli bir tercih.
- **Yedek dışarı kopyalanmıyor.** Aynı diskte duruyor; harici hedef operatörün
  kurması gereken şey.
- **Tek makine.** Yatay ölçekleme, oturum önbelleğinin süreçler arası
  paylaşımı ve iş zamanlayıcı yok.
