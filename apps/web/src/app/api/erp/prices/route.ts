import { ingestPrices } from "@repo/services";
import { erpPriceBatchSchema } from "@repo/types";
import { withAuthErrors } from "@/lib/guard";
import { requireAgent } from "@/lib/erp-guard";
import { parseBody } from "@/lib/validate";

// POST /api/erp/prices — fiyat listesi, ajandan.
//
// Matched on (variant, customer group, quantity tier), so a re-run overwrites
// instead of accumulating. An unknown customer group is skipped rather than
// created — groups decide who is charged what, and inventing one from an import
// would quietly change a customer's price.
export function POST(req: Request) {
  return withAuthErrors(async () => {
    const agent = await requireAgent(req);
    const { rows } = await parseBody(req, erpPriceBatchSchema);
    return Response.json(await ingestPrices(rows, agent.id));
  });
}
