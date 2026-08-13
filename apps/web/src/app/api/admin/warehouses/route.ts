import { listWarehouses, upsertWarehouse } from "@repo/services";
import { warehouseSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET  /api/admin/warehouses — depo listesi.
// POST /api/admin/warehouses — depo aç ya da güncelle (anahtar: kod).
//
// Depo *kodu* anahtar, ad değil: ERP köprüsü ambarları bu kodla eşliyor ve adı
// değiştirmek eşlemeyi bozmamalı.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "stock.view");
    return Response.json({ warehouses: await listWarehouses() });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "stock.manage");
    const input = await parseBody(req, warehouseSchema);
    return Response.json(await upsertWarehouse(input), { status: 201 });
  });
}
