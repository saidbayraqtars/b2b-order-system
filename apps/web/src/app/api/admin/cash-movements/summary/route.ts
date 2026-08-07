import { getCashSummary } from "@repo/services";
import { z } from "zod";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseQuery } from "@/lib/validate";

const rangeSchema = z.object({
  from: z.string().trim().min(8).max(40).optional(),
  to: z.string().trim().min(8).max(40).optional(),
});

// GET /api/admin/cash-movements/summary?from=&to= — gün sonu. No range means
// today, which is the question this screen is opened to answer.
export function GET(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "cash.view");
    const range = parseQuery(req, rangeSchema);
    return Response.json(await getCashSummary(range));
  });
}
