"use client";

import type { ReportRunResult } from "@repo/services";
import { formatCell, isNumericFormat } from "@/lib/format";
import { Button, WarnLine } from "@/components/form";
import { Table, TableEmpty, TBody, Td, Th, THead } from "@/components/ui";
import { BarChart, LineChart, PieChart } from "@/components/charts";

// Renders whatever the report engine returned: the table, an optional chart and
// a CSV export. Shared by the builder's live preview and the saved-report view,
// so both always show the same thing.

// Grafikler `components/charts.tsx`te: rapor önizlemesi ile yönetici panosu
// aynı çubuğu, çizgiyi ve pastayı çiziyor ve ikisi ayrı yazılsaydı tasarım
// dili iki yerden yönetilmeye başlardı.

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

/** Motorun döndürdüğü satırları ortak grafik diline çeviriyor. */
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
  const fmt = (v: number) => formatCell(v, valueColumn?.format ?? "number");

  return (
    <section className="rounded-lg border border-line p-4">
      {chart.type === "bar" && <BarChart points={points} format={fmt} />}
      {chart.type === "line" && <LineChart points={points} />}
      {chart.type === "pie" && <PieChart slices={points} format={fmt} />}
    </section>
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
