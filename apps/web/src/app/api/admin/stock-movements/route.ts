import { listStockMovements, recordManualStockMovement } from "@repo/services";
import { manualStockMovementSchema, stockMovementFilterSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody, parseQuery } from "@/lib/validate";

// GET  /api/admin/stock-movements — stok hareket defteri, süzülebilir.
// POST /api/admin/stock-movements — elle giriş/çıkış (fire, numune, hurda).
export function GET(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "stock.view");
    const filter = parseQuery(req, stockMovementFilterSchema);
    return Response.json({ movements: await listStockMovements(filter) });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "stock.manage");
    const input = await parseBody(req, manualStockMovementSchema);
    return Response.json(await recordManualStockMovement(input, user.id), {
      status: 201,
    });
  });
}
