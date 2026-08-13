import { getStockSummary } from "@repo/services";
import { z } from "zod";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseQuery } from "@/lib/validate";

const rangeSchema = z.object({
  from: z.string().trim().min(8).max(40).optional(),
  to: z.string().trim().min(8).max(40).optional(),
});

// GET /api/admin/stock-movements/summary — dönem özeti: ne girdi, ne çıktı,
// hangi sebeple. "Bu ay çıkan malın ne kadarı satış, ne kadarı fire".
export function GET(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "stock.view");
    const range = parseQuery(req, rangeSchema);
    return Response.json(await getStockSummary(range));
  });
}
