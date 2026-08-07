import { createDocumentSeries, listDocumentSeries } from "@repo/services";
import { createDocumentSeriesSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET  /api/admin/document-series — waybill/invoice serials and their counters.
// POST /api/admin/document-series
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "documents.view");
    return Response.json({ series: await listDocumentSeries() });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "documents.manage");
    const input = await parseBody(req, createDocumentSeriesSchema);

    return Response.json(await createDocumentSeries(input), { status: 201 });
  });
}
