import { notFound } from "next/navigation";
import { runReportDefinition } from "@repo/services";
import { requirePage } from "@/lib/guard";
import { REPORT_BUILDER_ROLES, reportContext } from "@/lib/report-context";
import { PrintButton } from "../../_components/print-button";
import { formatCell, isNumericFormat } from "@/lib/format";

/**
 * The report as a printable sheet — and, through the browser's own print
 * dialogue, as a PDF.
 *
 * There is no PDF generator on the server and that is a decision, not a gap.
 * Producing one means either a headless browser in the image (a browser's worth
 * of megabytes and CVEs to keep patched, on the machine that takes orders) or a
 * PDF library with an embedded font, because the standard PDF fonts have no
 * ş, ğ or İ and a Turkish report would print with holes in it. The browser
 * already has both, correct fonts included, on the machine of the person who
 * wants the file. Shipping labels print the same way (see /documents/labels).
 *
 * The consequence, stated rather than hidden: scheduled delivery can attach a
 * CSV or a spreadsheet, not a PDF. Nobody is standing at the printer at 07:00
 * anyway.
 *
 * ── Bu ekran `documents/**` ailesindendir (Adım 7 kararı) ───────────────────
 * Kâğıt her zaman beyaz: ham `neutral-*` sınıfları burada **bilerek** duruyor
 * ve anlamsal token kullanılmıyor, çünkü token koyu temada döner ve çıktı
 * beyaz-üstüne-beyaz olur. Aynı sebeple ekranın koyu tema karşılığı yok.
 *
 * **Adres de o aileye taşındı.** Sayfa önce `/reports/[id]/print` idi ve
 * `reports/layout.tsx`in kabuğunu miras alıyordu: yazdırma yüzeyinin
 * solunda 256 piksellik gezinme çubuğu duruyordu ve `@media print` onu
 * gizlemiyordu — yani kâğıda gezinme menüsü basılacaktı. Ekran görüntüsünde
 * görüldü. Bir yazdırma yüzeyi kabuk altında duramaz; `documents/**` zaten
 * kabuksuz.
 *
 * `DocumentShell` yine de kullanılmıyor: o kabuk satıcı künyesini basıyor ve
 * kiracı klasörü yoksa belgeyi "geçersiz" ilan ediyor. İrsaliye için doğru,
 * rapor için değil — bir rapor hukuki bir kayıt değil, bir çıktı. Kabuğun
 * *ölçüleri* (gri zemin, beyaz sayfa, basmayan araç şeridi) paylaşılıyor ki
 * ikisi aynı aileden görünsün.
 */
export default async function ReportPrintPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requirePage(REPORT_BUILDER_ROLES, "reports.view");

  // Same scope as anywhere else the report runs: a printable page is not a way
  // around the row scope.
  const result = await runReportDefinition(
    params.id,
    reportContext(user),
  ).catch(() => null);
  if (!result) notFound();

  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 12mm; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4">
        <p className="text-sm text-neutral-600">
          Tarayıcının yazdırma penceresinden “PDF olarak kaydet”i
          seçebilirsiniz.
        </p>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-5xl bg-white p-8 text-sm text-neutral-900 shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-4 border-b border-neutral-300 pb-3">
          <h1 className="text-xl font-bold">{result.definition.name}</h1>
          <p className="text-xs text-neutral-600">
            {new Date(result.generatedAt).toLocaleString("tr-TR")} ·{" "}
            {result.rowCount} satır
            {result.truncated ? " · tarama sınırına ulaşıldı" : ""}
          </p>
        </header>

        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b-2 border-neutral-800">
              {result.columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-2 py-1 font-semibold ${
                    isNumericFormat(c.format) ? "text-right" : ""
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i} className="border-b border-neutral-200">
                {result.columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-2 py-1 ${
                      isNumericFormat(c.format) ? "text-right tabular-nums" : ""
                    }`}
                  >
                    {formatCell(row[c.key] ?? null, c.format)}
                  </td>
                ))}
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr>
                <td
                  colSpan={Math.max(1, result.columns.length)}
                  className="px-2 py-6 text-center text-neutral-500"
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
