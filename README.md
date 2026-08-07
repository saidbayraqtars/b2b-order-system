# B2B Platformu (Monorepo)

Turborepo + pnpm. Sunucu tarafı Next.js Route Handler'ları (`apps/web` içinde); aynı uçları
Expo mobil uygulaması da kullanıyor.

## Dizin yapısı

```
apps/
  web/        Next.js App Router — Admin panel + B2B portal + API
  mobile/     Expo React Native — Plasiyer + Müşteri uygulaması
packages/
  database/       Prisma şeması, client singleton, seed
  types/          Zod şemaları + türetilmiş TS tipleri (edge-safe tek kaynak)
  auth/           Auth.js v5 edge-safe yapılandırma + RBAC yardımcıları
  services/       Domain katmanı — fiyatlama, sipariş, belgeler, cari, kampanya,
                  sepet, raporlar, e-posta, yönetim, güvenlik
  eslint-config/  Ortak ESLint önayarları (base / next / react-native)
  tsconfig/       Ortak TS temel yapılandırmaları
```

**`DEPLOYMENT.md` bir müşteri kurulumunun nasıl açıldığını, güncellendiğini ve geri
alındığını anlatır** — aşağıdakiler geliştirme ortamı içindir.

**`FEATURES.md` özellik envanteridir** — bugün gerçekten ne çalışıyor, her alanın arkasındaki
tasarım kararları ve bilinen eksikler orada. Önce oradan başlayın.

## Kurulum

```bash
# 1) pnpm'i etkinleştir (Node 20/22 önerilir; Node 24 çalışıyor ama Expo SDK 51 ile denenmedi)
corepack enable
corepack prepare pnpm@9.12.2 --activate

# 2) Bağımlılıklar
pnpm install

# 3) Ortam değişkenleri — örnekleri kopyala ve doldur
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp packages/database/.env.example packages/database/.env
cp apps/mobile/.env.example apps/mobile/.env
#   Auth secret üret:
cd apps/web && npx auth secret && cd ../..
#   Yerelde SMTP_HOST boş kalsın: e-posta gönderilmez, günlüğe basılır.
#   UPLOAD_DIR varsayılanı ./uploads — ürün görselleri oraya yazılır, public/ içine değil.
#   TENANT_DIR bu kurulumun HANGİ FİRMAYA ait olduğunu söyler; varsayılanı yoktur.
#   Örnek klasör depoyla geliyor: apps/web/.env içinde ../../tenants/demo kalsın.
#   Bkz. tenants/README.md — fatura/irsaliye başlığındaki satıcı oradan gelir.

# 4) Postgres (Docker) — host portu 5433, yereldeki 5432 ile çakışmasın diye
docker compose up -d

# 5) Veritabanı
pnpm db:generate        # prisma generate
pnpm db:migrate         # migration'ları uygula
pnpm db:seed            # admin + demo veri (idempotent, tekrar çalıştırılabilir)

# 6) Çalıştır
pnpm --filter web dev       # web: http://localhost:3000
pnpm --filter mobile start  # expo
```

## Doğrulama

```bash
pnpm typecheck   # her pakette tsc
pnpm lint        # ESLint, sıfır uyarı toleransı
pnpm test        # Vitest: birim takımı + entegrasyon takımı
pnpm build       # next build + paket derlemeleri
```

`pnpm test` iki takım çalıştırıyor; bugün 22 dosyada 292 test. **Birim takımı (70)** saf domain
matematiği, hiçbir şeye ihtiyacı yok. **Entegrasyon takımı (81)** gerçek bir Postgres ile
konuşuyor, kendi fixture'ını kuruyor (grup, firma, ürün, fiyat kademeleri, kampanyalar, belge
serileri) ve yalnızca kendi kayıtlarına dokunuyor — bu yüzden seed verisi olan bir veritabanında
da güvenle çalışıyor. `DATABASE_URL` yoksa takım başarısız olmuyor, **atlanıyor**. CI
(`.github/workflows/ci.yml`) dört komutu da Postgres servis konteyneri üzerinde koşturuyor.

Bilinmesi gereken bir fixture var: belge numarası üzerine iddiada bulunan bir test
`useOwnDefaultSeries()` çağırmak zorunda, çünkü bir seri yalnızca **varsayılan** olduğu sürece
numara veriyor. Kendi serisini kurup varsayılan yapmayı unutan test seed'deki sayaçtan çekmeye
devam eder ve tam olarak bir kez geçer — o sayacın hâlâ sıfır olduğu veritabanında.

## Seed hesapları (şifre: `Password123!`)

| E-posta              | Rol           |
| -------------------- | ------------- |
| admin@b2b.local      | SUPER_ADMIN   |
| rep@b2b.local        | SALES_REP     |
| manager@ornek.local  | COMPANY_ADMIN |
| staff@ornek.local    | COMPANY_STAFF |

## RBAC yol haritası

Tek gerçek kaynak: `packages/auth/src/rbac.ts`.

| Ön ek        | İzinli roller                                          |
| ------------ | ------------------------------------------------------ |
| `/admin`     | SUPER_ADMIN                                            |
| `/rep`       | SALES_REP, SUPER_ADMIN                                 |
| `/portal`    | COMPANY_ADMIN, COMPANY_STAFF, SUPER_ADMIN              |
| `/reports`   | SUPER_ADMIN, SALES_REP, COMPANY_ADMIN                  |
| `/orders`    | dört rol de (satırlar sunucuda kapsamlanır)            |
| `/documents` | dört rol de (belge, kendi firması üzerinden yetkilenir)|
| `/hesabim`   | dört rol de (yalnızca kendi hesabı)                    |

## Yetkilendirme modeli

Üç katman, ve sıra önemli:

1. **Edge `middleware.ts`** — imzalı çerezden rol kontrolü, `/login` ya da `/403`'e yönlendirir.
   Bir *ön filtre*: edge runtime'ın veritabanı erişimi yok.
2. **`requirePage()`** — Server Component'ler. Yönlendirir.
3. **`requireUser()`** — route handler'lar. JSON 401/403 döner.

(2) ve (3) `apps/web/src/lib/guard.ts` üzerinden geçiyor; orası hesabı **her istekte
veritabanından yeniden okuyor**. Oturum jetonu birinin bir kez giriş yaptığının kanıtıdır —
hesabın hâlâ var olduğunun, açık olduğunun ya da aynı role sahip olduğunun değil. Karara giren
rol ve `companyId` veritabanı satırından gelir, jetonun iddialarından değil.

`User.tokenVersion` rol, firma, aktiflik ya da şifre değiştiğinde artar; o hesaba daha önce
verilmiş **tüm** oturumları geçersiz kılar — web çerezi de, 30 günlük mobil bearer jetonu da.
Reddedilen oturumlar ve engellenen istekler denetim kaydına düşer (`/admin/audit`).

API yolları middleware haritasında bilerek yok: onları `requireUser()` koruyor, böylece HTML
yönlendirmesi yerine JSON dönüyorlar — mobil istemcinin ihtiyacı olan da bu.

## Sepetin fiyatlanması

Tek hesap, iki yerde kullanılıyor. `packages/services/src/order-quote.ts` içindeki
`buildQuote()` satırları doğruluyor (minimum sipariş, koli katı, stok), firmanın grup fiyatını
ve iskontosunu çözüyor, kampanya motorunu çalıştırıyor ve toplamı çıkarıyor.
`POST /api/orders/quote` bunu portala döndürüyor; `createOrder()` anlık görüntüyü yazmadan önce
**aynı fonksiyonu** kendi transaction'ı içinde yeniden çalıştırıyor. Tarayıcı hiçbir zaman
toplam hesaplamıyor, sunucu da eline verilen toplama hiçbir zaman güvenmiyor — önizleme ile
sipariş ayrışamıyor, bayat bir önizleme de o zamandan beri değişmiş bir fiyatı çivileyemiyor.

## Belgeler ve yandaki ERP

Bu sistem bir ERP'nin (VegaWin A5 / VegaDB ve benzerleri) yanında çalışmak üzere tasarlandı; bu
yüzden numaralandırma bir sabit değil, bir satır: `DocumentSeries` irsaliye ve faturalar için ön
eki, basamak genişliğini ve verilen son numarayı tutuyor. Numara tahsisi, çağıranın transaction'ı
içinde tek bir `UPDATE ... RETURNING` — böylece sıradaki numara için yarışan iki sevkiyat aynı
değeri okumak yerine satır kilidinin arkasında sıraya giriyor. İptal edilen belge numarasını
koruyor. Bir seriyi `externalOnly` olarak işaretlediğinizde uygulama numara üretmeyi tamamen
bırakıyor: ERP'nin numarasını şart koşuyor ve kendi sayacına dokunmuyor.

Sevkiyat sipariş bazlı değil, **miktar bazlı**. `Shipment`/`ShipmentItem` gerçekte neyin çıktığını
kaydediyor, `OrderItem.quantityShipped` kalanı takip ediyor ve siparişin durumu bundan
**türetiliyor** — bir şey kaldıysa PROCESSING, kalmadıysa SHIPPED. Faturalar da miktarı aynı
şekilde faturalıyor: ya seçilen irsaliyelerden ya da kalan her şeyden. Parayı asla yeniden
hesaplamıyorlar: fiyatlar ve kampanya payı sipariş satırında donmuştu, fatura oransal payını
alıyor, satırı kapatan fatura da yuvarlama artığını alıyor — bir siparişin faturaları
toplandığında kuruşu kuruşuna siparişe eşit oluyor.

Vade faturayla başlıyor. Cari borç hâlâ sipariş onaylandığında yazılıyor (kredi limitini ölçen
şey o) ama vade tarihi boş; ilk fatura vadeyi damgalıyor, sonraki faturalar yalnızca ileri
itiyor. Yaşlandırma bu tarihe göre kovalıyor, henüz faturalanmamış borçlar için sipariş tarihi +
firmanın vadesine düşüyor.

## Kurulum kimin adına belge basıyor

Her müşteri firma kendi kurulumunda çalışıyor, o hâlde "satıcı kim" bir tablo değil kurulumun bir
özelliği. Cevabı `tenants/<slug>/tenant.json` veriyor: unvan, vergi dairesi, VKN, adres, MERSİS,
logo, faturaya basılacak IBAN'lar. `TENANT_DIR` hangi klasör olduğunu söylüyor ve **varsayılanı
yok** — fatura basan bir sistem, kimin adına bastığını bilmiyorsa başkasının adına basmaktansa
durmalı.

Kaynak dosya, veritabanı değil. Klasör desteğin birimi: alınıyor, elle düzenleniyor, geri
gönderiliyor. Aynı bilgi veritabanında da dursaydı ikisi kaçınılmaz olarak ayrışırdı — müşteri
dosyayı düzenler, ekranda hiçbir şey değişmezdi. Dosya mtime'ına göre önbellekleniyor: düzenleyip
sayfayı yenilemek yetiyor, sunucu yeniden başlatılmıyor.

Eksik ya da bozuk dosyada belge sessizce satıcısız basılmıyor: başlıkta "Kurulum eksik — bu belge
geçersizdir" kırmızı bloğu ve hatanın tam sebebi çıkıyor. Doğrulama tüm eksikleri tek seferde
listeliyor, yarım dosya bir düzenlemede tamamlansın diye.

## Kampanya = veri

Bir kampanya bir satırdır: hepsi sağlanması gereken bir koşul listesi ve indirimi üreten bir
aksiyon listesi, ikisi de `{ type, params }` JSON'u olarak saklanır. Kural türlerinin kataloğu
`packages/services/src/promotion-registry.ts` içinde; orası aynı zamanda **güvenlik sınırı** —
tanımsız bir tür yoktur ve her parametre, kuralın yanında bildirilen Zod şemasından geçer, hem
yazarken *hem de* her çalıştırmada. İstemciden gelen (ya da doğrudan veritabanında düzenlenmiş
bir satırdan gelen) hiçbir şey kod olarak çalıştırılmaz.

`promotion-engine.ts` saftır: fiyatlanmış satırları ve derlenmiş kuralları alır, satır bazında
dağıtımı döner. Kampanyalar öncelik sırasıyla çalışır, her biri bir öncekinin bıraktığını görür
ve KDV kampanya sonrası net üzerinden alınır. Kullanım kotaları, siparişi hâlâ ayakta olan
kullanım satırlarını sayar; iptal kotayı geri verir ama sipariş neyi kazandığının kaydını
korur.

### Kampanya indirimi nereye düşer

Üç ayrı yere, ve bilerek ayrı tutuluyorlar. Satır indirimleri `promotionTotal`'a gider ve bu
tutar **her zaman** satırların toplamına eşittir — faturalama o rakamı satırlara paylaştırdığı
için içinde başka hiçbir şey saklanamaz. Navlun indirimi kaynağında `shippingFee`'den düşülür ve
`shippingDiscount` sütununa yazılır; **genel toplam hesabına girmez**, çünkü bir kez daha
çıkarmak nakliyeyi iki kez indirmek olurdu. Hediye ise kendi liste değerini ve ona eşit bir
indirimi taşıyan bir satırdır: sıfıra iner ama malın değersiz olduğunu iddia etmez — faturanın
göstermek zorunda olduğu şey de budur.

Motor üçünü ayrı ayrı raporlar ve hiçbir şeyi fiyatlamaz: *ne* verileceğini ve *kaç tane*
olduğunu bilir, değerlemeyi katalog üzerinden `buildQuote` yapar. Verilemeyen bir hediye —
stok bitmişse ya da bu firmaya uygulanabilir bir fiyatı yoksa — ölümcül değildir, atlanır.
Aylar önce yanlış kurulmuş bir kampanya bugünkü ödemeyi bloklamamalı.

## Mail sunucusu olmadan e-posta

`SMTP_HOST` boş bırakıldığında her mesaj gönderilmek yerine sunucu günlüğüne basılır — şifre
sıfırlama bağlantısı dahil; `/sifremi-unuttum` akışını yerelde mail hesabı olmadan baştan sona
yürütmenin yolu budur. `SMTP_HOST` verildiğinde aynı kod SMTP üzerinden gönderir; hatırlanması
gereken bir bayrak ve zamanla ayrışacak ayrı bir "geliştirme modu" yolu yoktur.

Gönderim çağırana hata fırlatmaz: bir bildirim zaten tamamlanmış bir işi duyurur, bu yüzden ölü
bir mail sunucusu duyurduğu siparişi geri almamalıdır. Her deneme denetim kaydına
`NOTIFICATION_SENT` ya da `NOTIFICATION_FAILED` olarak düşer.

Sıfırlama akışı yalnızca token'ın SHA-256'sını saklar, 60 dakikada süresini doldurur, tek
kullanımda harcar ve adresin bir hesaba ait olup olmadığına bakmaksızın aynı yanıtı verir —
aksi hâlde bu form müşteri listesi çıkarmanın yolu olurdu.

## Sepet bir satırdır, tarayıcı sekmesi değil

(firma, sahip) başına tek `Cart`. Kişinin ne seçtiğini tutar — varyant ve adet — ve para
hakkında hiçbir şey tutmaz: fiyat, kampanya ve KDV her okumada yeniden çözülür, böylece bir
sepet sessizce geçen haftanın fiyatını taşıyamaz. Minimum sipariş, koli katı ve stok burada
dayatılmaz; sepet bir taslaktır ve o kurallar geçersiz bir siparişi zaten teklifte ve ödeme
adımında durdurur. Sipariş verildiğinde sepet sunucu tarafında boşalır, ikinci bir sekme aynı
siparişi tekrarlayamaz.

Yüklenen görseller `UPLOAD_DIR` altına iner ve `/api/media/...` üzerinden geri gelir, hiçbir
zaman `public/` içinden değil — o dizin bir derleme girdisidir ve çalışma anında içine yazmak,
uygulama konteynerlendiği anda çalışmayı bırakır. Yükleme yolu ada değil **baytlara** güvenir:
yalnızca gerçek bir görsel imzası taşıyan dosyalar kabul edilir ve saklanan ad rastgeledir —
kaçılacak bir yol ve tahmin edilecek bir URL yoktur.

## Raporlar bir kayıt defteridir, sorgu dili değil

Kaydedilmiş bir rapor kullanıcı verisidir: HTTP üzerinden gelir, JSON olarak saklanır ve
doğrudan veritabanında düzenlenebilir. Bu yüzden içindeki hiçbir ad veritabanına ulaşmaz. Bir
alan önce veri kümesi kayıt defterinden çözülür ve çıkan şey **bizim** yazdığımız bir tanımdır:
yolu, tipi, neyin özetlenebileceği ve hangi ilişkilerden geçtiği.

Özetleme Postgres'te `GROUP BY` olarak çalışıyor; satır tarama sınırının kalkmasının sebebi de
bu: veritabanı kaç satır okursa okusun grup başına tek satır döndürüyor. Bu, SQL'i elle kurmayı
gerektiriyor ve burada güvenli olmasının tek bir sebebi var — ifadedeki her tanımlayıcı kayıt
defterinden geliyor, her değer bağlı parametre olarak taşınıyor. Kayıt defterinde olmayan bir
alan yoktur, dolayısıyla girdiden bir tanımlayıcıya giden yol da yoktur.

Satır kapsamı bir kez, Prisma filtresi olarak yazılıyor ve SQL yoluna çevriliyor. İki ayrı
kapsam tanımı, birinin "grupla" düğmesine bastığı gün açılacak bir delik olurdu; entegrasyon
testleri, rapor gruplandığında da plasiyerin yalnızca kendi portföyünü gördüğünü doğruluyor.

Kullanıcı kendi JOIN'ini yazamıyor — tasarım gereği. İlişkiler kayıt defterinde bildiriliyor ve
kaynak tabloya göre gruplanmış alanlar olarak sunuluyor; böylece tasarımcı, kimse sorgu
kurmadan "Firma → Müşteri grubu"nu teklif ediyor. Yeni bir ilişki eklemek orada tek satır, ve
arayüz onu kendiliğinden görüyor.

## Bir yetki girdisini önbelleğe almak

`loadPrincipal` beş saniyelik, süreç içi bir önbelleğin arkasında. Bu, bir erişim kararının
**girdisini** önbelleğe almak demek; o yüzden tasarım bilerek dar tutuldu: önbellek hesap
satırını saklar, asla bir hüküm saklamaz — kararı hâlâ her istekte `checkPrincipal` verir — ve
bir hesabın ne yapabileceğini değiştiren her yazma, girdiyi yazma tamamlandıktan **sonra**
düşürür; böylece bir iptal, TTL'in sonunda değil bir sonraki istekte ısırır. Yazmadan önce
düşürmek, eşzamanlı bir okumanın önbelleği tam da değiştirilmek üzere olan satırdan yeniden
doldurmasına izin verirdi.

Kalan açık saklanmıyor, yazılıyor: birden çok süreçte birindeki tahliye diğerlerine ulaşmaz, bu
yüzden bir iptalin başka yerde görülmesi TTL kadar sürebilir. Yük dengeleyici arkasında bu önemli
hâle gelir; çözümü paylaşılan bir tahliye sinyalidir — daha uzun bir TTL değil.

Hesap kilidi e-posta başına sayar, ki password spraying'in kaçındığı şey tam olarak budur: yüz
ayrı adrese birer deneme hiçbir şeyi tetiklemez. Bu yüzden başarısız girişler kaynak adres
başına da sayılıyor ve sayaç olarak, denetçinin okuduğu tabloyla çelişmekte özgür ikinci bir
tablo yerine **denetim kaydının kendisi** kullanılıyor. Güvenilen bir vekil üzerine yazmadığı
sürece `x-forwarded-for` istemci kontrolündedir; dolayısıyla bu, spraying'in maliyetini artırır
— erişim denetimi değildir ve içindeki hiçbir şey yetki kararı vermez.
