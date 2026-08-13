import {
  reportFileName,
  reportToCsv,
  reportToXlsx,
  runReportDefinition,
  XLSX_CONTENT_TYPE,
} from "@repo/services";
import { ReportFileFormatEnum } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { REPORT_BUILDER_ROLES, reportContext } from "@/lib/report-context";

// GET /api/reports/definitions/:id/export?format=XLSX — download the report.
//
// The file is built on the server rather than in the browser, so a scheduled
// delivery and a download of the same report are the same bytes. Scope is the
// caller's, exactly as when they run it.
export function GET(req: Request, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES, "reports.view");

    const raw = new URL(req.url).searchParams.get("format")?.toUpperCase();
    // An unreadable format is a CSV rather than an error: the query string is
    // the least interesting thing that can go wrong with a download.
    const format = ReportFileFormatEnum.safeParse(raw).data ?? "CSV";

    const result = await runReportDefinition(params.id, reportContext(user));
    const filename = reportFileName(result.definition.name, format);

    // A Buffer is a Uint8Array, but the Response types only know the latter.
    const body: BodyInit =
      format === "XLSX"
        ? new Uint8Array(reportToXlsx(result, result.definition.name))
        : reportToCsv(result);

    return new Response(body, {
      headers: {
        "content-type":
          format === "XLSX" ? XLSX_CONTENT_TYPE : "text/csv; charset=utf-8",
        // Quoted and ASCII-slugged upstream, so no filename* dance is needed.
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  });
}
