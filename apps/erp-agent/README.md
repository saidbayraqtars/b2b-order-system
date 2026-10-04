# ERP Ajanı

Müşterinin **kendi makinesinde** çalışır, ERP'sini okur, normalize veriyi B2B'ye
HTTPS ile gönderir.

```
ERP (VegaDB)  ──oku──▶  ajan  ──HTTPS──▶  B2B
```

## Neden ajan var

B2B, müşterinin SQL Server'ına ağ üzerinden uzanmaz. Uzanması için ya veritabanı
internete açılırdı ya da VPN kurulurdu; ikisi de bir sipariş sisteminin
müşteriden isteyeceği şeyler değil.

**ERP şemasını bilen taraf ajandır, B2B değil.** Bu bir güvenlik kararı:
alternatifi — kendisine gönderilen SQL'i çalıştıran bir ajan — B2B sunucusunu
ele geçiren birinin müşterinin muhasebe veritabanında keyfi SQL çalıştırması
demekti. Ajan yalnızca `src/vega.ts` içinde yazılı olan sorguları çalıştırır,
başka hiçbir şeyi.

**Eşitleme yönü ERP'ye yazmaz.** `src/vega.ts` içinde tek bir
INSERT/UPDATE/DELETE yoktur; cari ve stok okuması için veritabanı kullanıcısına
`db_datareader` dışında yetki vermeyin.

Sipariş aktarımı ayrı bir yol ve **varsayılan olarak kapalı** — aşağıdaki
"Yazma yönü" bölümüne bakın. Açıldığında bile ajan gönderilen SQL'i çalıştırmaz:
B2B yalnızca `src/commands.ts` içinde yazılı komutlardan birinin **adını**
gönderebilir.

## Kurulum

1. B2B'de **Yönetim → ERP** ekranından ajan açın. Token **bir kez** gösterilir;
   kaybedilirse yenilenir (eskisi anında geçersiz olur).
2. `agent.config.example.json` dosyasını `agent.config.json` olarak kopyalayın,
   doldurun.
3. Çalıştırın:

```bash
pnpm sync            # bir kez eşitle ve çık (Görev Zamanlayıcı için)
pnpm dev             # sürekli çalış, intervalMinutes'ta bir tekrarla
pnpm build && node dist/index.js --once
```

`--config baska.json` ile farklı bir dosya verilebilir; `AGENT_CONFIG` ortam
değişkeni de okunur.

## `vega.firma` / `vega.donem` nedir

VegaDB çok firmalı ve çok dönemli; tablo adları bu ikisinden kurulur:
`F0101D0017TBLSATFATBASLIK` = firma 0101, dönem 0017. Bu yüzden ikisi de
yapılandırmada durur, **tahmin edilmez** — dönemi yanlış tahmin eden bir
eşitleme geçen yılın rakamlarını okur ve çalışıyormuş gibi görünür.

Dönem kodları `TBLDONEM` tablosunda; ilk müşteride D0016=2025, D0017=2026.

## Ne eşitleniyor

| Eşitleme | Kaynak | Durum |
|----------|--------|-------|
| Cari kartları + bakiye | `TBLCARI` + `TBLCARIHAREKETLERI` | ✅ |
| Stok | `F{f}D{d}TBLDEPOENVANTER` + `TBLSTOKLAR` (dönem defterinin toplamı) | ✅ |
| Fiyat listesi | `TBLBIRIMLEREX.SATISFIYATI1..6` | ✅ (`prices.lists` haritası şart) |

**Stok neden dönem tablosundan okunuyor:** firma seviyesindeki
`TBLSTOKENVANTER` aynı şeye benziyor ama kritik seviye ızgarasıdır
(`ALTSEVIYE`, `KRITIKSEVIYE`, `SIPARISALINMASIN`); `ENVANTER` kolonunu kimse
güncel tutmuyor. İlk müşteride o tablonun 189.004 satırı toplam 13.462 adet
taşıyor (yalnız 2.740 satır sıfırdan farklı), aynı firmanın dönem defteri ise
13.587 kart için 101.692 adet. Yanlış tabloyu okumak, neredeyse boş bir katalog
yayımlar. `REZERV` de çıkarılmıyor: üç kurulumda da o kolon hep 0 — gerçek
rezerv `TBLALSIPLIST.REZERV` ile `TBLREZERVHAREKETLERI`'nde (kılavuz §62.2).
`IND < 100` olan dört sistem kartı (VADE FARKI, KUR FARKI, DEVIR, HIZMET) ürün
değildir ve atlanır — ilk müşteride tek başına DEVIR kartı 18.062 defter satırı
taşıyor.

**Fiyat nerede:** Vega altı satış fiyatını **stok kartında değil birim
kartında** tutar (`TBLBIRIMLEREX.SATISFIYATI1..6`), kart da sattığı birime
`TBLSTOKLAR.BIRIMEX` ile bağlanır. Bağlantıyı `VARSAYILAN = 1` üzerinden kurmak
kartların %17'sini (95.026'nın 15.821'i) sessizce düşürür — Vega'nın kendi
kullandığı kolon `BIRIMEX`'tir. Numarasız `SATISFIYATI` kolonu ölüdür (üç
kurulumda da sıfır satır); ajanın eski sürümü oraya baktığı için "fiyat yok"
sanılıyordu.

Hangi listenin hangi müşteri grubuna gittiği bir **iş kararıdır**, tahmin
edilmez — `agent.config.json` içinde yazılır:

```json
"sync": { "prices": true },
"prices": {
  "lists": [
    { "list": 1, "customerGroupCode": null },
    { "list": 2, "customerGroupCode": "Bayi" }
  ]
}
```

`customerGroupCode: null` = varsayılan kademe (grubu olmayan herkes). B2B'de
adı bulunmayan grup **atlanır**, açılmaz. Fiyat `KDVDAHIL = 1` ile tutuluyorsa
kartın KDV grubundaki orana göre net'e indirilir (ilk müşteride 95.017 satırın
95.009'u KDV dahil); grup adlarına güvenmeyin, "8 KDV" grubunun oranı **10**'dur.
TL dışı para birimindeki satırlar gönderilmez, sayısı günlüğe yazılır — b2b
fiyat satırında para birimi alanı yok ve dönüştürmek bu sürecin işi değil.

## Eşleme

Ajan **hiçbir kayıt oluşturmaz**, yalnızca eşleşenleri günceller:

- Cari → `Company.externalCode` = Vega'daki `FIRMAKODU`
- Stok → `ProductVariant.externalCode` = Vega'daki `STOKKODU`

Eşleşmeyen satırlar B2B'de **Yönetim → ERP** ekranında kod ve sebebiyle listelenir.
Bu bilerek böyle: ERP'de 79.829 cari var, bunların hangisinin B2B müşterisi
olacağı bir insanın kararı — içe aktarmanın değil.

## Cari bakiyesi

Vega'nın bildirdiği bakiye `Company.erpBalance` alanına yazılır, **`currentBalance`
üzerine değil**. İkincisi B2B'nin kendi defterinden türer ve her ekran ona göre
toplam alır; başka bir defterden gelen bir sayıyla üzerine yazmak, bakiyeyi
yanında basılan ekstreyle çelişir hâle getirirdi. İki defter yan yana gösterilir.

---

# Yazma yönü — siparişi ERP'ye aktarma

Eşitleme tek yönlüdür (ajan → B2B) ve tünel istemez. Sipariş aktarımı ters yön:
B2B ajana bir **komut** gönderir.

```
B2B  ──HTTPS──▶  Cloudflare Tunnel  ──▶  cloudflared (bu makinede)  ──▶  127.0.0.1:8787
```

Dışarıya port açılmaz, sabit IP gerekmez, müşterinin modemine dokunulmaz.

**Giden şey SQL değil.** B2B `writeOrder` gibi bir komut adı ve siparişin
normalize satırlarını gönderir; hangi tabloya nasıl yazılacağını bilen taraf bu
makinedeki ajandır. Okuma tarafındaki güvenlik sınırının aynısı.

## Tanımlı komutlar

| Komut | Yazar mı | Ne yapar |
|---|---|---|
| `ping` | hayır | Ajan ayakta mı, yazma açık mı, komut listesi. Veritabanına bağlanmaz — tünel testi budur. |
| `describeOrderTables` | hayır | Sipariş tablolarının **gerçek** sütunları, yürüyen belge serileri ve Vega'nın kendi yazdığı son siparişin dolu alanları. |
| `writeOrder` | **evet** | Siparişi `TBLALSIPBASLIK` + `TBLALSIPHAREKET` içine alınan sipariş (BELGETIPI 60) olarak yazar. |

Listede olmayan bir ad, gövde okunmadan reddedilir.

## Neden sipariş, neden fatura değil

Alınan sipariş **yasal belge değil** ve Vega'da başka hiçbir şeye dokunmaz:
stok hareketi yazmaz, cari defterine yazmaz, envanter oynatmaz. İki tablo, tek
transaction, geri alması iki `DELETE`. Fatura beş tablo, müşterinin bakiyesi ve
KDV beyanı demekti.

Müşteri siparişi Vega'da kontrol eder ve **kendi ekranından** faturaya çevirir;
e-fatura da Vega'nın kendi modülünden gider. B2B GİB ile hiç konuşmaz.

## Üç katmanlı kilit

Vega Veritabanı Kılavuzu §43.1'in deseni:

| Katman | Nerede | Varsayılan |
|---|---|---|
| 1. Uygulama bayrağı | `agent.config.json` → `write.enabled` | **kapalı** |
| 2. SQL yetkisi | VEGADB kullanıcısı `db_datareader` | **yazma yok** |
| 3. İnsan onayı | B2B'de `erp.push` yetkisi + onaylanmış siparişte düğme | — |

Üçü de açılmadan tek satır yazılmaz. Otomatik aktarım **yok**: belge, kimsenin
görmediği bir zamanlayıcıdan değil, birinin bastığı düğmeden gider.

## Kurulum — komut kanalı

1. `agent.config.json` içinde:

```json
"command": { "enabled": true, "host": "127.0.0.1", "port": 8787, "token": "…" }
```

Token'ı üretin (`openssl rand -base64 33`) ve **aynı değeri** B2B sunucusunda
`ERP_AGENT_TOKEN` olarak tanımlayın. En az 32 karakter olmalı, yoksa ajan
açılışta durur.

2. `cloudflared` kurun ve tüneli açın:

```bash
cloudflared tunnel login
cloudflared tunnel create b2b-erp
cloudflared tunnel route dns b2b-erp erp-ajan.musteri.com
```

`config.yml` (Windows'ta `%USERPROFILE%/.cloudflared/config.yml`):

```yaml
tunnel: b2b-erp
credentials-file: C:/Users/<kullanici>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: erp-ajan.musteri.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

```bash
cloudflared service install     # Windows servisi olarak: makine açılınca kalksın
```

3. B2B sunucusunda:

```
ERP_AGENT_URL=https://erp-ajan.musteri.com
ERP_AGENT_TOKEN=<ajandaki command.token ile aynı>
# Cloudflare Access hizmet token'ı kullanılıyorsa (önerilir):
ERP_AGENT_ACCESS_CLIENT_ID=...
ERP_AGENT_ACCESS_CLIENT_SECRET=...
```

4. Ajanı komut kanalıyla çalıştırın:

```bash
pnpm dev                       # eşitleme döngüsü + komut kanalı
node dist/index.js --serve     # yalnızca komut kanalı (eşitleme zamanlanmış görevdeyse)
```

Tünelin ayakta olduğunu doğrulamak için: `GET https://erp-ajan.musteri.com/health`
→ `{"ok":true}`. Bu uç kimlik istemez ve **başka hiçbir şey söylemez**; ERP'nin
durumunu öğrenmek için token gerekir.

> **Cloudflare Access'i açın.** Tünel adresi tahmin edilebilir bir alan adıdır;
> Access, ajanın kendi token'ının **önüne** ikinci bir kapı koyar. Hizmet
> token'ını yalnızca B2B sunucusuna verin.

## Yazmayı açmadan önce — sıra bu

Kılavuz §43.2'nin kontrol listesi, bu kuruluma uyarlanmış hâli:

1. **`describeOrderTables` çalıştırın** (yazma kapalıyken de çalışır). Bakılacaklar:
   - `configured.referenceColumnExists` — `write.referenceColumn` bu kurulumda
     var mı. Yoksa yazma reddedilir: b2b sipariş numarası belgeye yazılamazsa
     mükerrer kayıt engellenemez.
   - `configured.referenceColumnInUse` — Vega o sütunu kendisi kullanıyor mu.
     Doluysa başka bir sütun seçin.
   - `series` — hangi önekler yürüyor. `write.orderPrefix` bunlardan **biri
     olmamalı** (kılavuz §46.3): kendi serimiz ayrı yürür, Vega'nın numarasıyla
     çakışmaz. Varsayılan `B`.
   - `sampleHeader` — Vega'nın kendi yazdığı son siparişin dolu alanları.
     Ajanın yazdığıyla karşılaştırın.
2. VEGADB'nin **yedeğini alın**.
3. Mümkünse önce DEMO firmasında ya da kopyalanmış boş bir veritabanında deneyin.
4. `write.enabled` değerini açın ve SQL kullanıcısına yazma yetkisi verin:

```sql
USE [VEGADB];
ALTER ROLE db_datawriter ADD MEMBER [b2b_agent];
```

5. Canlıda **tek bir siparişle** deneyin ve Vega'nın kendi ekranında açıp doğru
   göründüğünü gözle doğrulayın. Bu adımın otomatiği yok.

## Ayarlar

| Alan | Ne işe yarar |
|---|---|
| `write.orderPrefix` | Kendi belge serimizin öneki (`B0000001`). Vega'nın serisini **sürdürmeyin**. |
| `write.referenceColumn` | b2b sipariş numarasının yazılacağı başlık sütunu. Mükerrer kaydı bu engelliyor. |
| `write.depo` | Satırların deposu (`HAREKETDEPOSU` / `DEPO`). |
| `write.userNo` | Başlıktaki `USERNO`. Gerçek kayıtlarda 100. |
| `write.branch` / `write.till` | `OZELKOD1` = şube, `OZELKOD2` = kasa. |

## Bir belgeyi geri alma

Sipariş iki tabloya yazılır ve başka hiçbir yere dokunmaz — geri alma da iki
ifadedir. B2B'deki sipariş ekranında yazan **belge numarası** ve **IND** ile:

```sql
BEGIN TRAN;
DELETE FROM [F0101D0017TBLALSIPHAREKET] WHERE EVRAKNO = @ind;
DELETE FROM [F0101D0017TBLALSIPBASLIK]  WHERE IND     = @ind;
COMMIT;
```

Silindikten sonra B2B'deki `erpDocumentNo` alanı da temizlenmelidir, yoksa
sipariş "aktarılmış" görünmeye devam eder.

## Yazılan belge neye benzer

- `BELGETIPI = 60`, `BELGENO = B0000001` (kendi serimiz)
- `FIRMANO` = cari kartın `IND`'i — kod eşleşmezse **hiçbir şey yazılmaz**
- Satırlar `EVRAKNO = başlık IND` ile bağlanır (kılavuz §19.1; yanlış bağlanan
  satır hatasız yazılır ve Vega'nın hiçbir ekranında görünmez)
- Fiyatlar **KDV hariç ve iskontolar düşülmüş**; başlıktaki `KDV` bir tutar
  değil, "fiyatlar KDV dahil mi" bayrağıdır (§22.5) ve `0` yazılır
- **Kargo bedeli satır olarak yazılmaz** — karşılığı bir stok kartı yok. Belgenin
  notuna yazılır, faturayı kesen kişi görsün diye
- Bu kurulumun tablosunda olmayan alanlar sessizce atlanır (§44.2) ama hangileri
  atlandığı B2B ekranına döner
