import { listSalesReps } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/admin/sales-reps — portfolio picker options for the company form.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "companies.view");
    return Response.json({ salesReps: await listSalesReps() });
  });
}
