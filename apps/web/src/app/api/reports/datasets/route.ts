import { describeDatasets } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { REPORT_BUILDER_ROLES } from "@/lib/report-context";

// GET /api/reports/datasets — field catalogue for the report builder:
// which datasets exist, which fields they expose, and which aggregates,
// operators and enum values each field accepts.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(REPORT_BUILDER_ROLES);
    return Response.json({ datasets: describeDatasets() });
  });
}
