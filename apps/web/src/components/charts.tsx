"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Grafiklerin ortak dili.
//
// Rapor önizlemesi (Adım 7) kendi çubuğunu, çizgisini ve pastasını yazıyordu;
// yönetici panosu aynılarına ihtiyaç duyunca ikinci bir kopya çıkacaktı. İkisi
// buradan besleniyor.
//
// **Renk yok, ton var.** Tasarım dilinin 1. kuralı gereği tek renk ailesi gri:
// rampa `--ink` üzerine saydamlık, yani koyu temada `dark:` ikizi olmadan
// dönüyor. Dilimler büyüklüğe göre sıralandığı için göz koyudan açığa okuyor.
//
// Kütüphane yok, SVG ve CSS var. Bir grafik kütüphanesi bu ekranların
// isteyeceğinden fazlasını getirir (etkileşimli zum, animasyon, kendi tema
// motoru) ve tasarım dilini ikinci bir yerden yönetmeye başlar.

export const INK_RAMP = [0.88, 0.72, 0.58, 0.46, 0.36, 0.28, 0.21, 0.15] as const;

export function ink(alpha: number): string {
  return `rgb(var(--ink) / ${alpha})`;
}

export function rampColor(index: number): string {
  return ink(INK_RAMP[index % INK_RAMP.length]!);
}

/** Grafiğin altındaki ilk/son etiket şeridi. */
export function AxisEnds({ first, last }: { first?: string; last?: string }) {
  return (
    <p className="mt-2 flex justify-between text-xs text-ink-faint">
      <span>{first}</span>
      <span>{last}</span>
    </p>
  );
}

export interface BarPoint {
  label: string;
  value: number;
  /** Üzerine çizilecek ikinci seri (hareketli ortalama gibi). */
  overlay?: number | null;
  title?: string;
}

/**
 * Sütun grafik, isteğe bağlı bir çizgi kaplamasıyla.
 *
 * Kaplama ayrı bir grafik değil aynı ölçekte ikinci bir seri: hareketli
 * ortalamayı ayrı bir kutuya çizmek, göze iki farklı ölçek karşılaştırtır.
 */
export function BarChart({
  points,
  height = "h-40",
  format,
}: {
  points: readonly BarPoint[];
  height?: string;
  format?: (v: number) => string;
}) {
  if (points.length === 0) return null;

  const values = points.flatMap((p) =>
    p.overlay == null ? [p.value] : [p.value, p.overlay],
  );
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pct = (v: number) => ((v - min) / span) * 100;

  const overlay = points.some((p) => p.overlay != null);

  return (
    <div>
      <div className={cn("relative flex items-end gap-1", height)}>
        {points.map((p, i) => (
          <div
            key={i}
            title={p.title ?? `${p.label}: ${format ? format(p.value) : p.value}`}
            className="flex-1 rounded-t bg-ink/70 transition-colors hover:bg-ink"
            style={{ height: `${Math.max(2, pct(p.value))}%` }}
          />
        ))}

        {overlay && (
          // `preserveAspectRatio="none"`: çizgi çubukların ölçeğine oturuyor,
          // kendi en-boy oranını dayatmıyor.
          <svg
            viewBox={`0 0 ${points.length - 1 || 1} 100`}
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <polyline
              fill="none"
              stroke={ink(0.95)}
              strokeWidth="1.5"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              points={points
                .map((p, i) =>
                  p.overlay == null ? null : `${i},${100 - pct(p.overlay)}`,
                )
                .filter(Boolean)
                .join(" ")}
            />
          </svg>
        )}
      </div>
      <AxisEnds first={points[0]?.label} last={points[points.length - 1]?.label} />
    </div>
  );
}

export function LineChart({
  points,
  height = "h-40",
}: {
  points: ReadonlyArray<{ label: string; value: number }>;
  height?: string;
}) {
  if (points.length === 0) return null;
  const max = Math.max(...points.map((p) => p.value), 0);
  const min = Math.min(...points.map((p) => p.value), 0);
  const span = max - min || 1;

  return (
    <div>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className={cn("w-full", height)}
      >
        <polyline
          fill="none"
          stroke={ink(0.85)}
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
          points={points
            .map((p, i) => {
              const x =
                points.length === 1 ? 50 : (i / (points.length - 1)) * 100;
              const y = 40 - ((p.value - min) / span) * 38 - 1;
              return `${x},${y}`;
            })
            .join(" ")}
        />
      </svg>
      <AxisEnds first={points[0]?.label} last={points[points.length - 1]?.label} />
    </div>
  );
}

export function PieChart({
  slices,
  format,
}: {
  slices: ReadonlyArray<{ label: string; value: number }>;
  format: (v: number) => string;
}) {
  const positive = slices.filter((p) => p.value > 0).slice(0, 8);
  const total = positive.reduce((a, p) => a + p.value, 0);
  if (total <= 0) {
    return (
      <p className="text-body-sm text-ink-faint">
        Pasta grafik için pozitif değer yok.
      </p>
    );
  }

  let cursor = 0;
  const stops = positive.map((p, i) => {
    const start = (cursor / total) * 360;
    cursor += p.value;
    return `${rampColor(i)} ${start}deg ${(cursor / total) * 360}deg`;
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div
        className="h-40 w-40 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
      />
      <ul className="space-y-1 text-body-sm">
        {positive.map((p, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: rampColor(i) }}
            />
            <span className="text-ink">{p.label}</span>
            <span className="tabular-nums text-ink-faint">
              {format(p.value)} · %{((p.value / total) * 100).toFixed(1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface WaterfallStep {
  label: string;
  /** İşaretli değer: artı yukarı, eksi aşağı. */
  delta: number;
  hint?: string;
}

/**
 * Köprü (şelale) grafiği: başlangıç → adımlar → bitiş.
 *
 * Artı ve eksi **tonla** ayrılıyor, renkle değil — yeşil/kırmızı burada bir
 * durum bildirmiyor, bir yön bildiriyor ve tasarım dilinde renk durumun işi.
 * Uçlar (başlangıç ve bitiş) tabandan yükseliyor, adımlar havada duruyor;
 * grafiği okunur kılan şey bu.
 */
export function Waterfall({
  start,
  steps,
  end,
  format,
}: {
  start: { label: string; value: number };
  steps: readonly WaterfallStep[];
  end: { label: string; value: number };
  format: (v: number) => string;
}) {
  const running: Array<{ from: number; to: number }> = [];
  let cursor = start.value;
  for (const s of steps) {
    running.push({ from: cursor, to: cursor + s.delta });
    cursor += s.delta;
  }

  const all = [start.value, end.value, ...running.flatMap((r) => [r.from, r.to])];
  const max = Math.max(...all, 0);
  const min = Math.min(...all, 0);
  const span = max - min || 1;
  const y = (v: number) => ((v - min) / span) * 100;

  const columns = [
    { label: start.label, bottom: 0, top: y(start.value), delta: null as number | null, hint: undefined as string | undefined },
    ...steps.map((s, i) => ({
      label: s.label,
      bottom: Math.min(y(running[i]!.from), y(running[i]!.to)),
      top: Math.max(y(running[i]!.from), y(running[i]!.to)),
      delta: s.delta,
      hint: s.hint,
    })),
    { label: end.label, bottom: 0, top: y(end.value), delta: null, hint: undefined },
  ];

  return (
    <div>
      <div className="flex h-48 items-end gap-2">
        {columns.map((c, i) => (
          <div key={i} className="relative flex h-full flex-1 flex-col justify-end">
            <div
              className={cn(
                "w-full rounded-sm",
                c.delta === null
                  ? "bg-ink/80"
                  : c.delta >= 0
                    ? "bg-ink/45"
                    : "bg-ink/20 outline-dashed outline-1 outline-offset-[-1px] outline-ink/40",
              )}
              style={{
                height: `${Math.max(1.5, c.top - c.bottom)}%`,
                marginBottom: `${c.bottom}%`,
              }}
              title={c.hint}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {columns.map((c, i) => (
          <div key={i} className="min-w-0 flex-1 text-center">
            <p className="truncate text-xs text-ink-muted">{c.label}</p>
            <p className="truncate text-xs tabular-nums text-ink-faint">
              {c.delta === null
                ? format(i === 0 ? start.value : end.value)
                : // Sıfır adım işaretsiz: `-0 >= 0` doğru olduğu için "+₺0,00"
                  // yazılıyordu ve o, para **eklendiğini** söyleyen bir cümle.
                  c.delta === 0
                  ? format(0)
                  : `${c.delta > 0 ? "+" : "−"}${format(Math.abs(c.delta))}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Isı hücresi — kohort matrisinin tek karesi.
 *
 * Yoğunluk yine `--ink` üzerine saydamlık. Yazı rengi zemin koyulaştıkça
 * dönüyor: %60'ın üstünde `on-accent`, altında `ink`. Sabit bir yazı rengi
 * matrisin bir ucunda okunamaz olurdu.
 */
export function HeatCell({
  ratio,
  children,
}: {
  ratio: number | null;
  children: ReactNode;
}) {
  if (ratio === null) {
    return <span className="block px-2 py-1 text-center text-xs text-ink-faint">—</span>;
  }
  const alpha = 0.08 + Math.min(1, Math.max(0, ratio)) * 0.8;
  return (
    <span
      className="block rounded-sm px-2 py-1 text-center text-xs tabular-nums"
      style={{
        backgroundColor: ink(alpha),
        color: alpha > 0.6 ? "rgb(var(--on-accent))" : "rgb(var(--ink))",
      }}
    >
      {children}
    </span>
  );
}
