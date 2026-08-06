import { listCashMovements, recordManualMovement } from "@repo/services";
import { cashMovementFilterSchema, manualMovementSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody, parseQuery } from "@/lib/validate";

// GET  /api/admin/cash-movements — the till ledger, filterable.
// POST /api/admin/cash-movements — elle giriş/çıkış (kasa gideri, devir farkı).
export function GET(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const filter = parseQuery(req, cashMovementFilterSchema);
    return Response.json({ movements: await listCashMovements(filter) });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, manualMovementSchema);
    return Response.json(await recordManualMovement(input, user.id), { status: 201 });
  });
}
