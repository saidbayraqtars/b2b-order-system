import { ingestStock } from "@repo/services";
import { erpStockBatchSchema } from "@repo/types";
import { withAuthErrors } from "@/lib/guard";
import { requireAgent } from "@/lib/erp-guard";
import { parseBody } from "@/lib/validate";

// POST /api/erp/stock — stok miktarları, ajandan.
//
// The ERP's figure wins: the warehouse is counted there and goods leave on its
// despatch notes, while this system only sees the part of the business that
// comes through the B2B.
export function POST(req: Request) {
  return withAuthErrors(async () => {
    const agent = await requireAgent(req);
    const { rows } = await parseBody(req, erpStockBatchSchema);
    return Response.json(await ingestStock(rows, agent.id));
  });
}
