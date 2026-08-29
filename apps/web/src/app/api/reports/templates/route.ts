import { z } from "zod";
import { installReportTemplate, REPORT_TEMPLATES } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { REPORT_BUILDER_ROLES, reportContext } from "@/lib/report-context";
import { parseBody } from "@/lib/validate";

// GET  /api/reports/templates — hazır şablon kataloğu.
// POST /api/reports/templates — bir şablonu çağıranın kendi raporuna kopyalar.
//
// Kapı rapor tasarımcısının kapısıyla aynı (`reports.build`): şablon kurmak,
// elle rapor kurmaktan başka bir yetki değil. Kurulan rapor **çağıranın**
// adına açılıyor ve çalışırken onun satır kapsamını kullanıyor — plasiyerin
// kurduğu "firma bakiyeleri" kendi portföyünü gösteriyor, tümünü değil.

const installSchema = z.object({ key: z.string().min(1).max(60) });

export function GET() {
  return withAuthErrors(async () => {
    await requireUser(REPORT_BUILDER_ROLES, "reports.build");
    return Response.json({
      // Tanımın kendisi (`config`) gönderilmiyor: ekran onu göstermiyor ve
      // bütün tanımları taşımak cevabı gereksiz yere şişirirdi.
      templates: REPORT_TEMPLATES.map((t) => ({
        key: t.key,
        name: t.name,
        description: t.description,
        category: t.category,
        dataset: t.dataset,
        question: t.question,
        columnCount: t.config.columns.length,
        chart: t.config.chart?.type ?? "table",
      })),
    });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES, "reports.build");
    const { key } = await parseBody(req, installSchema);
    const created = await installReportTemplate(key, reportContext(user));
    return Response.json(created, { status: 201 });
  });
}
