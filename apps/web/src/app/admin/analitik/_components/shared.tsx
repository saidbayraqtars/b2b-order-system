"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import type { Indicator } from "@repo/services";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

// Panonun iki dürüstlük kuralını taşıyan iki bileşen.

/**
 * "Bu sayı ne zaman hesaplandı."
 *
 * Bir panonun sessizce bayatlaması, yanlış sayı göstermesinden daha kötü:
 * yanlış sayı fark edilir, bayat sayı edilmez. Anlık bölümler bunu da
 * söylüyor — "canlı" demek, okuyanın kafasındaki soruyu kapatıyor.
 */
export function Stale({
  live,
  computedAt,
}: {
  live: boolean;
  computedAt: string | null;
}) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-faint">
      <Clock className="h-3.5 w-3.5" />
      {live ? (
        <>Canlı — sayfa açıldığı anda hesaplandı.</>
      ) : computedAt ? (
        <>
          Gecelik özet ·{" "}
          <span className="tabular-nums">
            {new Date(computedAt).toLocaleString("tr-TR")}
          </span>{" "}
          itibarıyla
        </>
      ) : (
        <>Henüz hesaplanmadı.</>
      )}
    </p>
  );
}

/**
 * Yeterli veri yoksa sayının yerine geçen kutu.
 *
 * Boş veriden çıkan bir yüzde de bir yüzde gibi görünür; bir panonun en kolay
 * yalan söylediği yer burası. Eksiğin kendisi yazılıyor: kaç ay gerekiyor,
 * kaçı var.
 */
export function Insufficient({ of }: { of: Extract<Indicator<never>, { ok: false }> }) {
  return (
    <p className="text-body-sm text-ink-faint">
      Yeterli veri yok —{" "}
      {of.reason ?? (
        <>
          en az{" "}
          <span className="tabular-nums text-ink-muted">{of.need}</span>{" "}
          {of.unit} gerekiyor,{" "}
          <span className="tabular-nums text-ink-muted">{of.have}</span> var.
        </>
      )}
    </p>
  );
}

/**
 * Sayının yerine geçen ifade.
 *
 * Kutunun içine 32 puntoluk bir tire koymak bozuk bir çizim gibi duruyordu
 * (ekran görüntüsünde görüldü); üstelik tire "sıfır" ile "bilinmiyor"u da
 * ayırmıyor. Sebebi altındaki ipucu satırı yazıyor, buradaki iş yalnızca
 * kutunun boş olmadığını söylemek.
 */
export function NoValue({ label = "yetersiz veri" }: { label?: string }) {
  return (
    <span className="text-headline-md font-normal text-ink-faint">{label}</span>
  );
}

/**
 * Kaynağına bağlanan sayı kutusu.
 *
 * §6.4'ün dördüncü kararı: bir sayıya tıklayınca onu üreten satırlara gitmeli,
 * yoksa yönetici sayıya güvenmez — ve haklıdır. Bağlantısı olmayan kutu
 * (henüz karşılığı olan bir liste ekranı yoksa) düz kart olarak duruyor;
 * tıklanabilir görünüp hiçbir yere gitmeyen bir kutu daha kötü.
 */
export function SourceTile({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  sourceLabel,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "positive" | "caution" | "critical";
  href?: string;
  sourceLabel?: string;
}) {
  const hintTone = {
    neutral: "text-ink-faint",
    positive: "text-positive",
    caution: "text-caution",
    critical: "text-critical",
  }[tone];

  const body = (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="tech-label">{label}</span>
        {href && (
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
        )}
      </div>
      <div className="text-headline-lg tabular-nums text-ink [overflow-wrap:anywhere]">
        {value}
      </div>
      {hint && <div className={cn("mt-1 text-xs", hintTone)}>{hint}</div>}
      {href && sourceLabel && (
        <div className="mt-2 text-xs text-ink-faint underline underline-offset-4">
          {sourceLabel}
        </div>
      )}
    </>
  );

  if (!href) return <Card>{body}</Card>;

  return (
    <Link
      href={href}
      className="block rounded-lg border border-line bg-panel p-4 transition-colors hover:border-line-strong hover:bg-subtle"
    >
      {body}
    </Link>
  );
}
