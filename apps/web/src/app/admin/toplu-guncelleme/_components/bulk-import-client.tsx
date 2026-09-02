"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Upload } from "lucide-react";
import type { ImportKind, ImportPlan, ImportResult, RowStatus } from "@repo/services";
import { formatTRY } from "@/lib/format";
import { Button, ErrorLine, LinkButton, Panel, WarnLine } from "@/components/form";
import {
  Badge,
  Note,
  PageHeader,
  StatTile,
  Table,
  TableEmpty,
  Tabs,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { PriceQueue } from "./price-queue";

// Akış tek yönlü ve ekran onu adım adım çiziyor:
//
//   şablonu indir → Excel'de düzelt → dosyayı seç → FARK ÖNİZLEMESİ → onayla
//
// **Önizlemeyi atlayan bir yol yok.** "Uygula" düğmesi ancak önizleme geldikten
// sonra çiziliyor ve sunucuya önizlemenin imzasını gönderiyor; imzasız istek
// zaten reddediliyor. Ekran tarafındaki bu kısıt bir kolaylık, kural sunucuda.

const STATUS_LABEL: Record<RowStatus, string> = {
  update: "Değişecek",
  create: "Yeni satır",
  unchanged: "Aynı",
  "unknown-sku": "SKU yok",
  "unknown-group": "Grup yok",
  invalid: "Okunamadı",
};

const STATUS_TONE: Record<RowStatus, "brand" | "success" | "neutral" | "warning" | "danger"> = {
  update: "brand",
  create: "success",
  unchanged: "neutral",
  "unknown-sku": "danger",
  "unknown-group": "warning",
  invalid: "danger",
};

/**
 * Üç sekme, tek ekran: ikisi dosya yükleyen, üçüncüsü yüklenenin **kuyruğu**.
 *
 * Kuyruk ayrı bir sayfaya konmadı çünkü oraya kayıt buradan giriliyor: zamanlı
 * fiyat, fiyat sekmesinden yüklenen dosyanın "Geçerlilik tarihi" sütunundan
 * doğuyor ve sonucunu görmek için başka bir adrese gitmek gerekmemeli.
 */
const TABS = [
  { key: "PRICE" as const, label: "Fiyat" },
  { key: "STOCK" as const, label: "Stok sayımı" },
  { key: "QUEUE" as const, label: "Zamanlı fiyatlar" },
];

type TabKey = (typeof TABS)[number]["key"];

const TAB_SLUG: Record<TabKey, string> = {
  PRICE: "fiyat",
  STOCK: "stok",
  QUEUE: "zamanli",
};

function tabFromSlug(slug: string | null): TabKey {
  const hit = (Object.keys(TAB_SLUG) as TabKey[]).find(
    (k) => TAB_SLUG[k] === slug,
  );
  return hit ?? "PRICE";
}

export function BulkImportClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = tabFromSlug(params.get("bolum"));
  // Kuyruk sekmesinde dosya yükleme yok; `kind` yalnızca iki yükleme sekmesi
  // için anlamlı ve orada `PRICE`a düşüyor.
  const kind: ImportKind = tab === "STOCK" ? "STOCK" : "PRICE";

  const { notify } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);

  function reset() {
    setPlan(null);
    setResult(null);
    setError(null);
  }

  async function send(mode: "preview" | "apply") {
    if (!file) return;
    setBusy(mode);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      if (mode === "apply") body.set("signature", plan?.signature ?? "");

      const res = await fetch(
        `/api/admin/bulk-import?kind=${kind}&mode=${mode}`,
        { method: "POST", body },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message ?? `İstek başarısız (${res.status})`);
      }

      if (mode === "preview") {
        setPlan(json.plan as ImportPlan);
        setResult(null);
      } else {
        setResult(json.result as ImportResult);
        setPlan(null);
        notify(
          kind === "PRICE" ? "Fiyatlar güncellendi" : "Sayım farkları işlendi",
        );
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  const applicable = plan ? plan.counts.update + plan.counts.create : 0;
  const rejected = plan
    ? plan.counts["unknown-sku"] + plan.counts["unknown-group"] + plan.counts.invalid
    : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Toplu güncelleme"
        subtitle="Excel'den fiyat ve stok — önce fark, sonra uygulama"
        actions={
          tab === "QUEUE" ? undefined : (
            <LinkButton
              href={`/api/admin/bulk-import?kind=${kind}`}
              variant="secondary"
              size="md"
            >
              Şablonu indir
            </LinkButton>
          )
        }
      />

      <Tabs
        value={tab}
        onChange={(next) => {
          reset();
          setFile(null);
          if (fileRef.current) fileRef.current.value = "";
          router.replace(`${pathname}?bolum=${TAB_SLUG[next]}`, {
            scroll: false,
          });
        }}
        items={TABS}
      />

      {tab === "QUEUE" && <PriceQueue />}

      {tab !== "QUEUE" && (
      <Panel title="1 · Dosyayı seçin">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,text/csv"
            aria-label="Yüklenecek dosya"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              reset();
            }}
            className="max-w-md text-body-sm text-ink-muted file:mr-3 file:rounded file:border file:border-line file:bg-panel file:px-3 file:py-1.5 file:text-body-sm file:text-ink-muted hover:file:bg-subtle"
          />
          <Button
            onClick={() => void send("preview")}
            loading={busy === "preview"}
            disabled={!file}
          >
            <Upload className="h-4 w-4" />
            Farkı göster
          </Button>
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          .xlsx ya da .csv, en fazla 8 MB ve 5000 satır. Sütunlar{" "}
          <strong>adına</strong> göre bulunuyor, sırasına göre değil — Excel&apos;de
          kolon taşımak sorun değil.
        </p>
        <ErrorLine error={error} />
      </Panel>
      )}

      {result && (
        <Panel title="Uygulandı">
          <p className="text-body-sm text-positive">
            {result.applied} satır işlendi, {result.skipped} satır atlandı.
          </p>
          {result.scheduled ? (
            <p className="mt-2 text-body-sm text-ink-muted">
              {result.scheduled} satır <strong>ileri tarihe</strong> alındı ve
              yürürlük günü geldiğinde uygulanacak.{" "}
              <a
                href="/admin/toplu-guncelleme?bolum=zamanli"
                className="underline underline-offset-4 hover:text-ink"
              >
                Kuyruğu görün
              </a>
              .
            </p>
          ) : null}
          {result.kind === "STOCK" && (
            <p className="mt-2 text-body-sm text-ink-muted">
              Sayım farkları <strong>stok defterine</strong> yazıldı — eldeki
              adet üstüne yazılmadı, farkı kadar hareket açıldı.{" "}
              <a
                href="/admin/stok?bolum=hareketler"
                className="underline underline-offset-4 hover:text-ink"
              >
                Hareketleri görün
              </a>
              .
            </p>
          )}
        </Panel>
      )}

      {plan && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Değişecek"
              value={plan.counts.update}
              hint="mevcut satırın değeri değişiyor"
            />
            <StatTile
              label="Yeni satır"
              value={plan.counts.create}
              tone={plan.counts.create > 0 ? "positive" : "neutral"}
              hint="karşılığı olmayan kademe açılacak"
            />
            <StatTile
              label="Aynı"
              value={plan.counts.unchanged}
              hint="dokunulmayacak"
            />
            <StatTile
              label="Reddedilen"
              value={rejected}
              tone={rejected > 0 ? "critical" : "neutral"}
              hint="tanınmayan SKU, grup ya da okunamayan değer"
            />
          </section>

          {rejected > 0 && (
            <WarnLine>
              <span>
                {rejected} satır uygulanmayacak. Uygulamak yine de mümkün —
                reddedilen satırlar atlanır — ama bu satırlar çoğu zaman kaymış
                bir kopyalamanın işareti. Dosyayı düzeltip farkı yeniden almak
                daha ucuz.
              </span>
            </WarnLine>
          )}

          <Panel
            title={`2 · Fark (${plan.totalRows} satır)`}
            bodyClassName="p-0 pb-1"
            action={
              <Button
                variant={rejected > 0 ? "secondary" : "primary"}
                loading={busy === "apply"}
                disabled={applicable === 0}
                onClick={() => {
                  const what =
                    kind === "PRICE"
                      ? `${applicable} fiyat satırı`
                      : `${applicable} varyantın stoğu`;
                  if (confirm(`${what} güncellenecek. Onaylıyor musunuz?`)) {
                    void send("apply");
                  }
                }}
              >
                Onayla ve uygula ({applicable})
              </Button>
            }
          >
            {kind === "PRICE" ? (
              <PriceDiff plan={plan} />
            ) : (
              <StockDiff plan={plan} />
            )}
          </Panel>
        </>
      )}

      {tab === "QUEUE" ? (
        <Note collapsible defaultOpen={false}>
          Bekleyen satır fiyatı <strong>değiştirmiyor</strong>: yürürlük günü
          gelince <a href="/admin/jobs" className="underline underline-offset-4 hover:text-ink">bakım işi</a>{" "}
          onu fiyat listesine işliyor ve o anki fiyatı satırda saklıyor — &ldquo;ne
          zaman, ne kadar zam&rdquo; sorusu burada cevaplanıyor. İş saat başı
          koşuyor; gece yarısı hassasiyeti isteyen kurulum periyodu kısaltabilir.
          <br />
          <br />
          Uygulanmış bir satır <strong>iptal edilemiyor</strong>: fiyatı geri
          almak ayrı bir karardır ve yeni bir zamanlı değişiklikle yapılır.
          Sessizce geri sarmak, aradaki siparişlerin hangi fiyattan geçtiğini
          belirsiz bırakırdı.
        </Note>
      ) : (
      <Note collapsible defaultOpen={false}>
        <strong>Fark önizlemesi pazarlık konusu değil.</strong> Bir dosyayı
        doğrudan uygulamak, yanlış sütuna kaymış bir kopyalamanın bütün kataloğu
        bir kuruşa satması demek. Sunucu farkı hesaplayıp{" "}
        <strong>imzalıyor</strong>; &ldquo;uygula&rdquo; isteği o imzayı geri
        gönderiyor ve sunucu farkı yeniden hesaplayıp karşılaştırıyor. Aradan
        biri girip bir fiyatı değiştirdiyse imza tutmuyor ve uygulama
        reddediliyor. Her uygulama{" "}
        <a
          href="/admin/audit"
          className="underline underline-offset-4 hover:text-ink"
        >
          denetim kaydına
        </a>{" "}
        yazılıyor: kim, kaç satır, hangi dosya.
      </Note>
      )}
    </div>
  );
}

function PriceDiff({ plan }: { plan: ImportPlan }) {
  const rows = plan.priceRows ?? [];
  return (
    <>
      <Table stickyHead>
        <THead>
          <tr>
            <Th align="right">Satır</Th>
            <Th>SKU</Th>
            <Th>Ürün</Th>
            <Th>Grup</Th>
            <Th align="right">Min adet</Th>
            <Th align="right">Mevcut</Th>
            <Th align="right">Yeni</Th>
            <Th>Yürürlük</Th>
            <Th>Durum</Th>
          </tr>
        </THead>
        <TBody>
          {rows.map((r) => (
            <tr key={`${r.line}-${r.sku}`}>
              <Td align="right" numeric muted>
                {r.line}
              </Td>
              <Td className="font-mono text-xs">{r.sku}</Td>
              <Td muted>{r.productName ?? "—"}</Td>
              <Td muted>{r.groupName ?? "liste"}</Td>
              <Td align="right" numeric muted>
                {r.minQuantity}
              </Td>
              <Td align="right" numeric muted>
                {r.currentPrice === null ? "—" : formatTRY(r.currentPrice)}
              </Td>
              <Td
                align="right"
                numeric
                className={r.status === "update" ? "font-medium text-ink" : ""}
              >
                {r.newPrice === null ? "—" : formatTRY(r.newPrice)}
              </Td>
              {/* Tarihsiz satır **hemen** uygulanıyor ve bunu yazmak gerekiyor:
                  boş bir hücre, tarih girmeyi unutmuş kişiye hiçbir şey
                  söylemez. */}
              <Td muted={r.effectiveDate === null}>
                {r.effectiveDate === null
                  ? "hemen"
                  : new Date(`${r.effectiveDate}T00:00:00`).toLocaleDateString(
                      "tr-TR",
                      { day: "2-digit", month: "long", year: "numeric" },
                    )}
              </Td>
              <Td>
                <span className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[r.status]}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                  {r.message && (
                    <span className="text-xs text-ink-faint">{r.message}</span>
                  )}
                </span>
              </Td>
            </tr>
          ))}
          {rows.length === 0 && <TableEmpty colSpan={9} label="Satır yok." />}
        </TBody>
      </Table>
      <Truncated shown={rows.length} total={plan.totalRows} />
    </>
  );
}

function StockDiff({ plan }: { plan: ImportPlan }) {
  const rows = plan.stockRows ?? [];
  return (
    <>
      <Table stickyHead>
        <THead>
          <tr>
            <Th align="right">Satır</Th>
            <Th>SKU</Th>
            <Th>Ürün</Th>
            <Th align="right">Defterde</Th>
            <Th align="right">Sayılan</Th>
            <Th align="right">Fark</Th>
            <Th>Durum</Th>
          </tr>
        </THead>
        <TBody>
          {rows.map((r) => (
            <tr key={`${r.line}-${r.sku}`}>
              <Td align="right" numeric muted>
                {r.line}
              </Td>
              <Td className="font-mono text-xs">{r.sku}</Td>
              <Td muted>{r.productName ?? "—"}</Td>
              <Td align="right" numeric muted>
                {r.currentStock ?? "—"}
              </Td>
              <Td align="right" numeric>
                {r.countedStock ?? "—"}
              </Td>
              <Td
                align="right"
                numeric
                className={
                  r.difference === null || r.difference === 0
                    ? "text-ink-faint"
                    : r.difference > 0
                      ? "font-medium text-positive"
                      : "font-medium text-critical"
                }
              >
                {r.difference === null
                  ? "—"
                  : `${r.difference > 0 ? "+" : ""}${r.difference}`}
              </Td>
              <Td>
                <span className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[r.status]}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                  {r.message && (
                    <span className="text-xs text-ink-faint">{r.message}</span>
                  )}
                </span>
              </Td>
            </tr>
          ))}
          {rows.length === 0 && <TableEmpty colSpan={7} label="Satır yok." />}
        </TBody>
      </Table>
      <Truncated shown={rows.length} total={plan.totalRows} />
    </>
  );
}

/**
 * Önizleme kesilmişse söyleniyor.
 *
 * Kesilen şey **çizim**: imza ve uygulama satırların tamamından çıkıyor. Bunu
 * yazmak zorunlu — "300 satır gördüm, onayladım" diyen biri 4000 satır
 * uyguladığını bilmeli.
 */
function Truncated({ shown, total }: { shown: number; total: number }) {
  if (shown >= total) return null;
  return (
    <p className="mx-4 mt-3 text-xs text-ink-faint">
      İlk <span className="tabular-nums">{shown}</span> satır gösteriliyor;
      uygulama <span className="tabular-nums">{total}</span> satırın tamamını
      kapsıyor.
    </p>
  );
}
