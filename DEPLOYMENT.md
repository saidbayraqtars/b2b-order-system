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

- **Merkezden güncelleme yok.** Her sunucu kendi `update.sh`'ını çalıştırır;
  merkezî bir "paket çek" ajanı yazılmadı.
- **Yedek dışarı kopyalanmıyor.** Aynı diskte duruyor; harici hedef operatörün
  kurması gereken şey.
- **Tek makine.** Yatay ölçekleme, oturum önbelleğinin süreçler arası
  paylaşımı ve iş zamanlayıcı yok.
