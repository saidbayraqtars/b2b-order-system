"use client";

import type { ReportRunResult } from "@repo/services";
import { formatCell, isNumericFormat } from "@/lib/format";
import { Button, WarnLine } from "@/components/form";
import { Table, TableEmpty, TBody, Td, Th, THead } from "@/components/ui";

// Renders whatever the report engine returned: the table, an optional chart and
// a CSV export. Shared by the builder's live preview and the saved-report view,
// so both always show the same thing.

/**
 * Grafik rampası — tek renk ailesi, o da mürekkep.
 *
 * Eskiden sekiz renkli kategorik bir palet vardı (indigo, teal, kehribar…) ve
 * tasarım dilinin 1. kuralını tek başına çiğneyen yer orasıydı: renk burada bir
 * işaret değil, yalnızca "bu dilim şu dilim değil" demek. Aynı şeyi ton
 * söyleyebiliyor — dilimler zaten büyüklüğe göre sıralı, göz koyudan açığa
 * okuyor.
 *
 * Değerler `--ink` üzerine saydamlık: koyu temada değişken beyaza döndüğü için
 * rampa da kendiliğinden dönüyor, `dark:` ikizi gerekmiyor.
 */
const RAMP = [0.88, 0.72, 0.58, 0.46, 0.36, 0.28, 0.21, 0.15] as const;
const ink = (alpha: number) => `rgb(var(--ink) / ${alpha})`;

/**
 * Pano kartında gösterilen satır sayısı.
 *
 * Kesme **veriyi** kısıtlıyor, kutuyu değil. Kart önce `max-h` + kaydırma
 * kutusuydu ve nerede kesildiği görünmüyordu: bir kartta tablonun yalnızca
 * başlık satırı kalmıştı, altında hiç veri yoktu — ekranın kendisi bozuk
 * görünüyordu. Fotoğraf kaydırmıyor; kart neyi gösterecekse tamamını
 * göstermeli. Kaç satır olduğunu üstteki tarama satırı söylüyor, tamamı
 * "Raporu aç"ın arkasında.
 */
const COMPACT_ROWS = 8;

export function ReportPreview({
  result,
  title,
  /**
   * Dashboard tile: drop the scan line and the CSV button. On a board they are
   * eight identical rows of chrome around the numbers people came to read, and
   * the report is one click away with its own export.
   */
  compact = false,
}: {
  result: ReportRunResult;
  title?: string;
  compact?: boolean;
}) {
  // The engine already dropped hidden columns; everything returned is shown.
  const visible = result.columns;
  const rows = compact ? result.rows.slice(0, COMPACT_ROWS) : result.rows;
  const clipped = result.rows.length - rows.length;

  return (
    <div className="space-y-3">
      {/* Tarama satırı: pano kartında da duruyor, yalnızca indirme düğmesi
          düşüyor. Kart `max-h` ile kesiliyor ve fotoğrafta kaydırma çubuğu
          görünmüyor — "20 satır" yazmasaydı kart sekiz satırlık bir rapor gibi
          okunurdu. Kartta indirme yok çünkü rapor bir tık ötede ve kendi
          dosyasını zaten veriyor. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs tabular-nums text-ink-faint">
          {result.rowCount} satır
          {result.grouped ? " (gruplanmış)" : ""}
          {clipped > 0
            ? ` · ilk ${rows.length} gösteriliyor`
            : ` · ${result.scannedRows} kayıt tarandı`}
        </p>
        {!compact && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadCsv(result, title)}
            disabled={result.rows.length === 0}
          >
            CSV indir
          </Button>
        )}
      </div>

      {result.truncated && (
        <WarnLine>
          Tarama sınırına ulaşıldı — özetler yalnızca okunan kayıtları kapsıyor.
          Filtreleri daraltın.
        </WarnLine>
      )}

      {result.chart && result.chart.type !== "table" && (
        <Chart result={result} />
      )}

      <Table>
        {/* Genişlikler `colgroup`ta: kullanıcının seçtiği piksel bir sütunun
            özelliği, başlık hücresinin değil. */}
        <colgroup>
          {visible.map((c) => (
            <col key={c.key} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <THead>
          <tr>
            {visible.map((c) => (
              <Th
                key={c.key}
                align={isNumericFormat(c.format) ? "right" : "left"}
              >
                {c.label}
              </Th>
            ))}
          </tr>
        </THead>
        <TBody>
          {rows.map((row, i) => (
            <tr key={i}>
              {visible.map((c) => (
                <Td
                  key={c.key}
                  align={isNumericFormat(c.format) ? "right" : "left"}
                  numeric={isNumericFormat(c.format)}
                  className="py-2"
                >
                  {formatCell(row[c.key] ?? null, c.format)}
                </Td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <TableEmpty
              colSpan={Math.max(1, visible.length)}
              label="Bu koşullarda kayıt yok."
            />
          )}
        </TBody>
      </Table>
    </div>
  );
}

/** Charts are hand-drawn with CSS/SVG — one fewer dependency to keep current. */
function Chart({ result }: { result: ReportRunResult }) {
  const chart = result.chart!;
  const catKey = chart.categoryField!;
  const valKey = chart.valueField!;
  const valueColumn = result.columns.find((c) => c.key === valKey);
  const catColumn = result.columns.find((c) => c.key === catKey);

  const points = result.rows
    .slice(0, 40)
    .map((r) => ({
      label: formatCell(r[catKey] ?? null, catColumn?.format ?? "text"),
      value: Number(r[valKey] ?? 0),
    }))
    .filter((p) => Number.isFinite(p.value));

  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value), 0);
  const min = Math.min(...points.map((p) => p.value), 0);
  const span = max - min || 1;
  const fmt = (v: number) => formatCell(v, valueColumn?.format ?? "number");

  return (
    <section className="rounded-lg border border-line p-4">
      {chart.type === "bar" && (
        <>
          <div className="flex h-40 items-end gap-1">
            {points.map((p, i) => (
              <div
                key={i}
                title={`${p.label}: ${fmt(p.value)}`}
                className="flex-1 rounded-t bg-ink/70 transition-colors hover:bg-ink"
                style={{
                  height: `${Math.max(2, ((p.value - min) / span) * 100)}%`,
                }}
              />
            ))}
          </div>
          <Axis points={points} />
        </>
      )}

      {chart.type === "line" && (
        <>
          <svg
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            className="h-40 w-full"
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
          <Axis points={points} />
        </>
      )}

      {chart.type === "pie" && <Pie points={points} format={fmt} />}
    </section>
  );
}

function Axis({ points }: { points: { label: string }[] }) {
  return (
    <p className="mt-2 flex justify-between text-xs text-ink-faint">
      <span>{points[0]?.label}</span>
      <span>{points[points.length - 1]?.label}</span>
    </p>
  );
}

function Pie({
  points,
  format,
}: {
  points: { label: string; value: number }[];
  format: (v: number) => string;
}) {
  const positive = points.filter((p) => p.value > 0).slice(0, 8);
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
    const end = (cursor / total) * 360;
    return `${ink(RAMP[i % RAMP.length]!)} ${start}deg ${end}deg`;
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
              style={{ backgroundColor: ink(RAMP[i % RAMP.length]!) }}
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

/** Semicolon-separated with comma decimals and a BOM — Turkish Excel opens it. */
function downloadCsv(result: ReportRunResult, title?: string) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    result.columns.map((c) => esc(c.label)).join(";"),
    ...result.rows.map((row) =>
      result.columns
        .map((c) => {
          const raw = row[c.key];
          if (raw === null || raw === undefined) return "";
          return isNumericFormat(c.format)
            ? String(raw).replace(".", ",")
            : esc(formatCell(raw, c.format));
        })
        .join(";"),
    ),
  ];

  const blob = new Blob(["﻿" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(title ?? "rapor").replace(/[^\w]+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
