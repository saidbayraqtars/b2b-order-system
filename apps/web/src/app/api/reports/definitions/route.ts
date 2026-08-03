import {
  createReportDefinition,
  listReportDefinitions,
} from "@repo/services";
import { createReportDefinitionSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { REPORT_BUILDER_ROLES, reportContext } from "@/lib/report-context";
import { parseBody } from "@/lib/validate";

// GET  /api/reports/definitions — the caller's own reports plus shared ones.
// POST /api/reports/definitions — save a new one (config validated against the
// dataset registry before it is written).
export function GET() {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES);
    return Response.json({
      definitions: await listReportDefinitions(reportContext(user)),
    });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES);
    const input = await parseBody(req, createReportDefinitionSchema);

    const created = await createReportDefinition(input, reportContext(user));
    return Response.json(created, { status: 201 });
  });
}
