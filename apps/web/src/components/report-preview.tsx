"use client";

import type { ReportRunResult } from "@repo/services";
import { formatTRY } from "@/lib/format";

// Renders whatever the report engine returned: the table, an optional chart and
// a CSV export. Shared by the builder's live preview and the saved-report view,
// so both always show the same thing.

const PALETTE = [
  "#6366f1",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#0ea5e9",
  "#84cc16",
  "#ec4899",
];

export function formatCell(
  value: string | number | boolean | null,
  format: string,
): string {
  if (value === null || value === undefined) return "—";
  switch (format) {
    case "money":
      return formatTRY(Number(value));
    case "percent":
      return `%${Number(value).toLocaleString("tr-TR")}`;
    case "number":
      return Number(value).toLocaleString("tr-TR");
    case "date":
      return new Date(String(value)).toLocaleDateString("tr-TR");
    case "datetime":
      return new Date(String(value)).toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    default:
      return typeof value === "boolean" ? (value ? "Evet" : "Hayır") : String(value);
  }
}

export function ReportPreview({
  result,
  title,
}: {
  result: ReportRunResult;
  title?: string;
}) {
  // The engine already dropped hidden columns; everything returned is shown.
  const visible = result.columns;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-neutral-500">
          {result.rowCount} satır
          {result.grouped ? " (gruplanmış)" : ""} · {result.scannedRows} kayıt
          tarandı
        </p>
        <button
          type="button"
          onClick={() => downloadCsv(result, title)}
          disabled={result.rows.length === 0}
          className="h-8 rounded-md border border-neutral-300 px-3 text-xs disabled:opacity-50 dark:border-neutral-700"
        >
          CSV indir
        </button>
      </div>

      {result.truncated && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Tarama sınırına ulaşıldı — özetler yalnızca okunan kayıtları kapsıyor.
          Filtreleri daraltın.
        </p>
      )}

      {result.chart && result.chart.type !== "table" && (
        <Chart result={result} />
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
            <tr>
              {visible.map((c) => (
                <th
                  key={c.key}
                  className={`px-3 py-2 ${isNumeric(c.format) ? "text-right" : ""}`}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {result.rows.map((row, i) => (
              <tr key={i}>
                {visible.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2 ${isNumeric(c.format) ? "text-right tabular-nums" : ""}`}
                  >
                    {formatCell(row[c.key] ?? null, c.format)}
                  </td>
                ))}
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr>
                <td
                  className="px-3 py-6 text-center text-neutral-500"
                  colSpan={Math.max(1, visible.length)}
                >
                  Bu koşullarda kayıt yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function isNumeric(format: string): boolean {
  return format === "money" || format === "number" || format === "percent";
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
    <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      {chart.type === "bar" && (
        <>
          <div className="flex h-40 items-end gap-1">
            {points.map((p, i) => (
              <div
                key={i}
                title={`${p.label}: ${fmt(p.value)}`}
                className="flex-1 rounded-t"
                style={{
                  height: `${Math.max(2, ((p.value - min) / span) * 100)}%`,
                  backgroundColor: PALETTE[0],
                }}
              />
            ))}
          </div>
          <Axis points={points} />
        </>
      )}

      {chart.type === "line" && (
        <>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-40 w-full">
            <polyline
              fill="none"
              stroke={PALETTE[0]}
              strokeWidth="0.8"
              vectorEffect="non-scaling-stroke"
              points={points
                .map((p, i) => {
                  const x = points.length === 1 ? 50 : (i / (points.length - 1)) * 100;
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
    <p className="mt-2 flex justify-between text-xs text-neutral-500">
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
    return <p className="text-sm text-neutral-500">Pasta grafik için pozitif değer yok.</p>;
  }

  let cursor = 0;
  const stops = positive.map((p, i) => {
    const start = (cursor / total) * 360;
    cursor += p.value;
    const end = (cursor / total) * 360;
    return `${PALETTE[i % PALETTE.length]} ${start}deg ${end}deg`;
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div
        className="h-40 w-40 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
      />
      <ul className="space-y-1 text-sm">
        {positive.map((p, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
            />
            <span>{p.label}</span>
            <span className="text-neutral-500">
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
          return isNumeric(c.format)
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
