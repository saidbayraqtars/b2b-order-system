import { runReport } from "@repo/services";
import { runReportSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { REPORT_BUILDER_ROLES, reportContext } from "@/lib/report-context";
import { parseBody } from "@/lib/validate";

// POST /api/reports/run — execute a definition without saving it.
// This is what the builder's live preview calls.
export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES);
    const { dataset, config } = await parseBody(req, runReportSchema);

    return Response.json(await runReport(dataset, config, reportContext(user)));
  });
}
