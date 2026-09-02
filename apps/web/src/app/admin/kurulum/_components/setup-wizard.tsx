"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  CircleDashed,
  Package,
  TriangleAlert,
} from "lucide-react";
import type { SetupPack, SetupStatus, SetupStepKey } from "@repo/services";
import { Badge, Card, Meter } from "@/components/ui";
import { Button, LinkButton, Panel } from "@/components/form";
import { cn } from "@/lib/utils";

// Kurulum sihirbazı — boş bir kuruluma bakan kişinin yol haritası.
//
// Ekranın tamamı **canlı**: adımların tamam/eksik durumu her yüklemede
// veritabanından okunuyor. Bir yerde "kurulum tamamlandı" kutucuğu tutulmuyor;
// tutulsaydı, son firmayı silen kişiye sistem hâlâ "hazır" derdi.
//
// Sıra rastgele değil, bağımlılık sırası: kategorisiz ürün açılmıyor, fiyatsız
// varyant sipariş edilemiyor, grubu olmayan firma liste fiyatı görüyor. Yanlış
// sırada ilerleyen kişi bunu ancak boş bir açılır listede fark ediyordu.

interface StepCopy {
  title: string;
  /** Neden gerekli — atlanınca ne bozulur. */
  why: string;
  /** Ne yapılacak, tek cümle. */
  todo: string;
  href: string;
  cta: string;
  /** Sayı yerine yazılacak birim: "4 grup", "12 ürün". */
  unit: string;
}

const COPY: Record<SetupStepKey, StepCopy> = {
  tenant: {
    title: "Firma bilgileri",
    why: "Fatura ve irsaliyeye basılan satıcı budur. Okunamazsa belgeler geçersiz basılır.",
    todo: "Kiracı klasöründeki tenant.json dosyasına unvan, VKN, vergi dairesi ve adresi yaz.",
    href: "/admin/organization",
    cta: "Kuruluş",
    unit: "dosya",
  },
  customerGroups: {
    title: "Müşteri grupları",
    why: "Fiyat gruba verilir. Grubu olmayan firma liste fiyatını görür.",
    todo: "Bayi, zincir, toptancı gibi fiyat seviyelerini aç.",
    href: "/admin/customer-groups",
    cta: "Gruplar",
    unit: "grup",
  },
  categories: {
    title: "Kategoriler",
    why: "Ürün kategorisiz açılmaz; vitrindeki menü de buradan çıkar.",
    todo: "Ana başlıkları ve alt kırılımları kur.",
    href: "/admin/categories",
    cta: "Kategoriler",
    unit: "kategori",
  },
  warehouses: {
    title: "Depolar",
    why: "Stok hareketi bir depoya yazılır. Deposuz kurulumda mal kabul yapılamaz.",
    todo: "En az bir depo aç ve varsayılan olarak işaretle.",
    href: "/admin/stok",
    cta: "Stok defteri",
    unit: "depo",
  },
  products: {
    title: "Ürünler ve varyantlar",
    why: "Satılan şey varyanttır: barkod, koli içi adet, birim ve parti takibi orada durur.",
    todo: "Ürünü aç, varyantını ekle; gıdada SKT takibi ve kasa/kg çarpanını da orada işaretle.",
    href: "/admin/products",
    cta: "Ürünler",
    unit: "varyant",
  },
  prices: {
    title: "Fiyatlar",
    why: "Fiyatı olmayan varyant sipariş edilemez — sepete eklenirken reddedilir.",
    todo: "Her varyanta liste fiyatı, gerekiyorsa grup bazlı kademe gir.",
    href: "/admin/products",
    cta: "Fiyat gir",
    unit: "fiyat satırı",
  },
  paymentTerms: {
    title: "Vadeler",
    why: "Sipariş ekranındaki ödeme seçenekleri buradan gelir; boşsa yalnızca peşin çalışır.",
    todo: "Peşin, 30 gün, 45 gün gibi piyasadaki vadeleri tanımla.",
    href: "/admin/payment-terms",
    cta: "Vadeler",
    unit: "vade",
  },
  cashAccounts: {
    title: "Kasa ve banka",
    why: "Peşin tahsilat bir hesaba düşer. Hesap yoksa tahsilat kaydedilemez.",
    todo: "En az bir kasa aç; banka ve POS hesaplarını ayrı tut.",
    href: "/admin/kasa",
    cta: "Kasa & Banka",
    unit: "hesap",
  },
  companies: {
    title: "Müşteri firmaları",
    why: "Sipariş firmaya kesilir: risk limiti, vadesi ve plasiyeri firmanın üzerindedir.",
    todo: "Firmayı aç, grubunu ve adresini gir, plasiyerini ata.",
    href: "/admin/companies",
    cta: "Firmalar",
    unit: "firma",
  },
  users: {
    title: "Kullanıcılar",
    why: "Bayi kendi kullanıcısıyla girer, plasiyer ve kurye kendi ekranını görür.",
    todo: "Firma açıldıktan sonra kullanıcıyı ona bağla, iznini seç.",
    href: "/admin/users",
    cta: "Kullanıcılar",
    unit: "kullanıcı",
  },
  stock: {
    title: "Açılış stoğu",
    why: "Stoksuz da sipariş alınır, ama eldeki adet sıfır göründüğü sürece uyarılar yanlış çalışır.",
    todo: "Mal kabul ile açılış miktarını gir; parti takipli üründe parti kodu ve SKT sorulur.",
    href: "/admin/stok",
    cta: "Mal kabul",
    unit: "hareket",
  },
  erp: {
    title: "ERP köprüsü",
    why: "Cari ve stok ERP'de tutuluyorsa köprü eşitler — kurulmazsa iki yerde ayrı veri olur.",
    todo: "Ajan aç, tek seferlik anahtarı kopyala, müşterinin makinesindeki ajana yapıştır.",
    href: "/admin/erp",
    cta: "ERP köprüsü",
    unit: "ajan",
  },
};

/** Ekrandaki sıra = bağımlılık sırası. */
const ORDER: readonly SetupStepKey[] = [
  "tenant",
  "customerGroups",
  "categories",
  "warehouses",
  "products",
  "prices",
  "paymentTerms",
  "cashAccounts",
  "companies",
  "users",
  "stock",
  "erp",
];

export function SetupWizard({
  status,
  packs,
}: {
  status: SetupStatus;
  packs: readonly SetupPack[];
}) {
  const byKey = new Map(status.steps.map((s) => [s.key, s]));
  const steps = ORDER.map((key) => byKey.get(key)).filter(
    (s): s is NonNullable<typeof s> => s !== undefined,
  );

  // Sıradaki iş: tamamlanmamış **zorunlu** ilk adım. İsteğe bağlı olanlar
  // burayı işgal etmiyor, yoksa kurulum hiç bitmiyormuş gibi görünürdü.
  const next = steps.find((s) => !s.done && !s.optional);
  const pct = Math.round((status.progress.done / status.progress.total) * 100);

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-body-sm font-semibold text-ink">
            {status.ready
              ? "Kurulum tamam — sistem sipariş alabilir."
              : `Sıradaki adım: ${next ? COPY[next.key].title : "—"}`}
          </p>
          <p className="text-body-sm tabular-nums text-ink-muted">
            {status.progress.done}/{status.progress.total} adım
          </p>
        </div>
        <div className="mt-3">
          <Meter
            value={pct}
            tone={status.ready ? "positive" : "neutral"}
            label="Kurulum ilerlemesi"
          />
        </div>
      </Card>

      <PackPanel packs={packs} defaultOpen={!status.ready} />

      <ol className="space-y-3">
        {steps.map((step, i) => (
          <StepRow
            key={step.key}
            index={i + 1}
            copy={COPY[step.key]}
            done={step.done}
            optional={step.optional}
            count={step.count}
            problem={step.problem}
            isNext={next?.key === step.key}
          />
        ))}
      </ol>
    </div>
  );
}

function StepRow({
  index,
  copy,
  done,
  optional,
  count,
  problem,
  isNext,
}: {
  index: number;
  copy: StepCopy;
  done: boolean;
  optional: boolean;
  count: number;
  problem?: string;
  isNext: boolean;
}) {
  // Tamamlanmış adım tek satıra iniyor: "ne yapılacak" ve "neden gerekli"
  // metinleri yapılmamış bir iş için yazıldı; yapılmış olanın altında iki satır
  // daha durmasının tek etkisi, kalan işi ekranın dışına itmek. Sorunlu adım
  // istisna — orada tam metin hâlâ gerekli.
  const compact = done && !problem;

  if (compact) {
    return (
      <li className="flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-positive/10 text-positive">
          <Check className="h-3.5 w-3.5" />
        </span>
        <h3 className="min-w-0 truncate text-body-sm font-medium text-ink">
          {copy.title}
        </h3>
        <span className="shrink-0 text-xs tabular-nums text-ink-faint">
          {count} {copy.unit}
        </span>
        {optional && <Badge tone="neutral">İsteğe bağlı</Badge>}
        <Link
          href={copy.href}
          className="ml-auto shrink-0 text-xs text-ink-muted transition-colors hover:text-ink"
        >
          {copy.cta}
        </Link>
      </li>
    );
  }

  return (
    // Sıradaki adım renkle değil kenarla ve bir künyeyle işaretleniyor: mavi bir
    // çerçeve tasarım dilinde hiçbir şey söylemiyor, "sıradaki" ise bir durum
    // değil bir yön — onu yazıyla söylemek gerekiyor.
    <li
      className={cn(
        "rounded-lg border bg-panel p-4",
        isNext ? "border-line-strong" : "border-line",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-semibold tabular-nums",
            done ? "bg-positive/10 text-positive" : "bg-sunken text-ink-faint",
          )}
        >
          {done ? <Check className="h-4 w-4" /> : index}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-headline-sm text-ink">{copy.title}</h3>
            {isNext && <Badge tone="brand">Sıradaki</Badge>}
            {optional && <Badge tone="neutral">İsteğe bağlı</Badge>}
            {done && (
              <span className="text-xs tabular-nums text-ink-faint">
                {count} {copy.unit}
              </span>
            )}
          </div>

          <p className="mt-1 text-body-sm text-ink-muted">{copy.todo}</p>
          <p className="mt-1 text-xs text-ink-faint">{copy.why}</p>

          {problem && (
            <p className="mt-2 flex items-start gap-1.5 rounded border border-critical/30 bg-critical/10 px-2 py-1 text-xs text-critical">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-pre-wrap">{problem}</span>
            </p>
          )}
        </div>

        <LinkButton href={copy.href}>
          {copy.cta}
          <ChevronRight className="h-3.5 w-3.5" />
        </LinkButton>
      </div>
    </li>
  );
}

/** Uygulanan paketin dökümü: ne yazıldı, neye dokunulmadı. */
interface PackResult {
  created: Record<string, number>;
  skipped: Record<string, number>;
}

function PackPanel({
  packs,
  defaultOpen,
}: {
  packs: readonly SetupPack[];
  /** Kurulum bittiyse kapalı: paket bir başlangıç aleti, kalıcı bir ayar değil. */
  defaultOpen: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<PackResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function apply(pack: SetupPack) {
    setBusy(pack.key);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pack: pack.key }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Paket uygulanamadı");
        return;
      }
      setResult(body.report as PackResult);
      // Adım listesi sunucuda çiziliyor: yazılan satırlar ancak yenilemeyle
      // görünür.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel
      title="Hazır sektör paketi"
      icon={<Package className="h-4 w-4" />}
      collapsible
      defaultOpen={defaultOpen}
      summary={`${packs.length} paket`}
    >
      <p className="text-body-sm text-ink-muted">
        Grup, kategori ağacı, vade, depo, kasa ve hacim merdivenini tek seferde
        kurar.{" "}
        <strong className="font-semibold text-ink">
          Ürün ve müşteri taşımaz
        </strong>{" "}
        — onlar her firmada başka. Tekrar çalıştırılabilir: var olan satıra
        dokunmaz, yalnızca eksiği yazar.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {packs.map((p) => (
          // Kart bir sütun: özet metni uzun olan pakette düğme aşağı kayıp
          // yanındakiyle hizasını kaybediyordu.
          <div
            key={p.key}
            className="flex flex-col rounded border border-line p-3"
          >
            <p className="text-body-sm font-medium text-ink">{p.name}</p>
            <p className="mt-0.5 text-xs text-ink-muted">{p.summary}</p>
            <p className="mt-1.5 flex-1 text-xs tabular-nums text-ink-faint">
              {p.customerGroups.length} grup ·{" "}
              {p.categories.reduce(
                (n, c) => n + 1 + (c.children?.length ?? 0),
                0,
              )}{" "}
              kategori · {p.paymentTerms.length} vade · {p.warehouses.length}{" "}
              depo · {p.cashAccounts.length} hesap
            </p>
            <Button
              size="sm"
              className="mt-3 self-start"
              loading={busy === p.key}
              disabled={busy !== null}
              onClick={() => void apply(p)}
            >
              Bu paketi uygula
            </Button>
          </div>
        ))}
      </div>

      {error && (
        <p className="mt-3 rounded border border-critical/30 bg-critical/10 px-2.5 py-1.5 text-body-sm text-critical">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 rounded border border-positive/30 bg-positive/10 px-2.5 py-2 text-body-sm text-positive">
          <p className="font-medium">Paket uygulandı.</p>
          <p className="mt-0.5 text-xs">
            Yazılan: {summarise(result.created)} · Dokunulmayan:{" "}
            {summarise(result.skipped)}
          </p>
        </div>
      )}
    </Panel>
  );
}

function summarise(bag: Record<string, number>): string {
  const parts = Object.entries(bag).map(([k, n]) => `${n} ${k.toLowerCase()}`);
  return parts.length > 0 ? parts.join(", ") : "yok";
}

/** Kurulum ekranı boşken diğer sayfalarda gösterilen kısa yol. */
export function SetupHint({ done, total }: { done: number; total: number }) {
  return (
    <Link
      href="/admin/kurulum"
      className="flex items-center gap-2 rounded-lg border border-line-strong bg-sunken px-3 py-2 text-body-sm text-ink transition-colors hover:bg-subtle"
    >
      <CircleDashed className="h-4 w-4 shrink-0 text-ink-faint" />
      <span>
        Kurulum sürüyor —{" "}
        <strong className="tabular-nums">
          {done}/{total}
        </strong>{" "}
        adım tamam. Sihirbazı aç.
      </span>
      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-ink-faint" />
    </Link>
  );
}
