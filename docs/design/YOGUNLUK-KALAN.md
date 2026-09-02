# Yoğunluk işi — mekanik kapanış kaydı

Tarih: 2026-09-02 · Kaynak: `docs/design/YOGUNLUK-RAPORU.md` §4 "C — küçük ama
ucuz".

> **Durum — ✅ tamamlandı (2026-09-02).** Dört ekleme şeridi katlandı; bekleyen
> 45 `<Note>` çağrısının tamamı kapalı başlıyor. Atlanan sunucu bileşeni olmadı.
> Typecheck ve sıfır uyarılı lint temiz; üretim derlemesi ile 20 test dosyası /
> 396 test geçti.
>
> **Düzeltme (aynı gün, incelemede):** notların katlanması 48 ekranın boyunu
> değiştirdi, yani görüntüler bayatladı — "ölçüm tekrarlanmasın" talimatı
> *ölçümü* kastediyordu, ekran görüntülerini değil. 92 görüntü tazelendi ve
> `--check` artık 89 ekranın hepsini aynı buluyor. Ayrıca aynı ekranda birden
> fazla not aynı varsayılan başlığı alıyordu; altısına ayrı başlık verildi
> (ayrıntı raporun Faz 6 bölümünde).

Bu belge, Faz 5'in C listesindeki son iki tekrar kalıbının devir ve kapanış
kaydını birlikte tutar.

Her değişiklikten sonra çalıştırılacak:

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json && npx next lint --max-warnings=0
```

---

## İş 1 — Dört ekranın "yeni satır ekle" şeridi katlansın — ✅ 4/4

**Neden:** şerit listenin üstünde sürekli duruyor ama kullanıcı bu formlara ayda
birkaç kez dokunuyor. Aynı karar kasa, kategori ve stok ekranlarında zaten
verildi; yayılması kaldı.

**Kalıp** — `categories-manager.tsx`teki bitmiş hâli örnek alın
(`src/app/admin/categories/_components/categories-manager.tsx:166`):

```tsx
import { Disclosure } from "@/components/disclosure";

// önce:
<div className="flex flex-wrap items-end gap-3 border-b border-line bg-sunken p-4">
  …form alanları…
</div>

// sonra:
<div className="border-b border-line bg-sunken px-4 py-3">
  <Disclosure label="+ Yeni grup" storageKey="customer-groups:new">
    <div className="flex flex-wrap items-end gap-2 pb-1">
      …form alanları, aynen…
    </div>
  </Disclosure>
</div>
```

`storageKey` her ekranda farklı olmalı (açıklık durumu tarayıcıda o anahtarla
saklanıyor). `label` ekranın dilinde: "+ Yeni grup", "+ Yeni vade",
"+ Yeni seri", "+ Yeni basamak".

**Dosyalar ve satırlar:**

| Dosya | Şerit | `label` | `storageKey` |
| --- | --- | --- | --- |
| `src/app/admin/customer-groups/_components/groups-manager.tsx` | 45 | `+ Yeni grup` | `customer-groups:new` |
| `src/app/admin/payment-terms/_components/terms-manager.tsx` | 44 | `+ Yeni vade` | `payment-terms:new` |
| `src/app/admin/documents/_components/series-manager.tsx` | 66 | `+ Yeni seri` | `documents-series:new` |
| `src/app/admin/volume-tiers/_components/tiers-manager.tsx` | 80 | `+ Yeni basamak` | `volume-tiers:new` |

Satır numaraları yaklaşık — aranacak işaret `border-b border-line bg-sunken`
taşıyan, formun kendisini saran ilk `<div>`.

**Dikkat:** formun içindeki hata satırı (`<ErrorLine error={create.error} />`)
`Disclosure`ın **içinde** kalmalı. Dışarı çıkarsa, kapalı bir şeridin altında
sahibi belirsiz bir hata mesajı durur.

---

## İş 2 — 45 `<Note>` katlansın — ✅ 45/45

**Neden:** notların içeriği projenin en iyi yanlarından biri — ilk okumada
gerekli, ellinci açılışta gürültü. O yüzden **kısaltılmıyor, katlanıyor.**

**Kalıp** (alet hazır, `src/components/ui.tsx` · `Note`):

```tsx
// önce:
<Note>
  Bu ekran <strong>küratörlü</strong>: …
</Note>

// sonra:
<Note collapsible defaultOpen={false}>
  Bu ekran <strong>küratörlü</strong>: …
</Note>
```

Başlık varsayılan **"Bu ekran nasıl çalışır"**; başka bir başlık gerekiyorsa
`title="…"` verin. İçeriğe dokunulmuyor.

**Sunucu bileşeni tuzağı:** `Note collapsible` durum tutuyor, yani istemci
sınırının bu yanında olmalı. Bir sayfa dosyası `"use client"` taşımıyorsa
(çoğu `page.tsx` taşımıyor) `collapsible` eklemek derlemede
`Event handlers cannot be passed to Client Component props` benzeri bir hata
verir. O dosyalarda iki seçenek var:

1. Notu zaten istemci olan alt bileşene taşıyın, ya da
2. Notu küçük bir istemci sarmalayıcıya alın.

Hangisinin gerektiği dosya dosya değişiyor; **hata almadan** eklenen yerleri
bırakın, hata alanları listeye not düşüp atlayın — tek tek çözmek ayrı bir iş.

**Çağrı yerleri** (45 tane, `collapsible` taşımayanlar):

```
src/app/admin/activity/page.tsx
src/app/admin/analitik/_components/analytics-board.tsx
src/app/admin/analitik/_components/cash-section.tsx
src/app/admin/analitik/_components/customer-section.tsx        (3 tane)
src/app/admin/analitik/_components/growth-section.tsx
src/app/admin/analitik/_components/live-section.tsx
src/app/admin/analitik/_components/pace-section.tsx
src/app/admin/announcements/page.tsx
src/app/admin/audit/page.tsx
src/app/admin/categories/page.tsx
src/app/admin/cekler/page.tsx
src/app/admin/customer-groups/page.tsx
src/app/admin/deliveries/_components/delivery-tabs.tsx         (2 tane)
src/app/admin/documents/page.tsx
src/app/admin/erp/_components/command-panel.tsx
src/app/admin/erp/page.tsx
src/app/admin/iadeler/page.tsx
src/app/admin/jobs/page.tsx
src/app/admin/kurulum/page.tsx
src/app/admin/labels/page.tsx
src/app/admin/mutabakat/page.tsx
src/app/admin/organization/page.tsx
src/app/admin/payment-terms/page.tsx
src/app/admin/prim/page.tsx
src/app/admin/promotions/_components/promotion-performance.tsx
src/app/admin/promotions/_components/promotions-tabs.tsx       (2 tane)
src/app/admin/reports/_components/reports-client.tsx
src/app/admin/sayfa-duzeni/page.tsx
src/app/admin/siparis-kurallari/page.tsx
src/app/admin/stok/_components/lots-panel.tsx
src/app/admin/stok/_components/stock-workbench.tsx             (2 tane)
src/app/admin/stok/_components/warehouses-panel.tsx
src/app/admin/surum/page.tsx
src/app/admin/tatiller/_components/holiday-manager.tsx
src/app/admin/toplu-guncelleme/_components/bulk-import-client.tsx (2 tane)
src/app/admin/users/page.tsx
src/app/admin/volume-tiers/page.tsx
src/app/hesabim/_components/account-client.tsx
src/app/reports/sablonlar/_components/template-gallery.tsx
```

Listeyi tazelemek için:

```bash
cd apps/web && grep -rn "<Note" src/app src/components | grep -v collapsible
```

---

---

## Not — ölçüm zaten alındı

`docs/design/YOGUNLUK-RAPORU.md` §1.1'de iş öncesi/sonrası tam tablo var
(3000px üstü ekran 10 → 1). Bu iki iş bittikten sonra ölçümü **tekrarlamaya
gerek yok**: ikisi de sayfa boyunu birkaç yüz piksel etkiliyor, kimse eşiği
aşmıyor. Yine de bakmak isterseniz aşağıdaki adım duruyor.

## Bitince

1. `docs/design/YOGUNLUK-RAPORU.md`de üstteki durum kutusunu ve §7 Faz
   tablosundaki 5. satırı ✅ yapın.
2. Veritabanı ve geliştirme sunucusu ayakken ölçüm alın:

   ```bash
   pnpm --filter web dev -p 3100
   SHOT_BASE_URL=http://localhost:3100 node scripts/screenshots.mjs
   ```

   Koşunun sonunda 2500 pikseli aşan ekranların dökümü yazdırılıyor. Rapordaki
   tahminlerle (`~1900px`, `~1700px` …) karşılaştırıp gerçek sayıları §4
   tablosuna yazın.

## Yapmayın

`docs/design/YOGUNLUK-RAPORU.md` §5 tam liste; en sık yanlış yapılanlar:

- Sipariş kalem tablosu, portal ürün ızgarası, pano ABC tablosu — sayfanın
  konusu onlar.
- `StatTile` satırları (4 kutu ≈ 110px, zaten tek bakışta okunuyor).
- Giriş / şifre / kayıt ekranları (hepsi < 900px).
- 1–2 kontrollük süzgeç şeritleri. `Disclosure` eşiği **3+ kontrol**.
- Kenar çubuğu gezinme grupları — gezinmenin işi nereye gidileceğini
  *göstermek*; kapatmak aradığını bilmeyen kullanıcıyı kör eder.
