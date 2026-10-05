import type { NextRequest } from "next/server";
import { createVariantUnit, listVariantUnits } from "@repo/services";
import { upsertVariantUnitSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

// GET /api/admin/variants/:id/units — kalemin paket birimleri (koli, palet).
export function GET(_req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "products.view");
    const units = await listVariantUnits(params.id);
    return Response.json({ units });
  });
}

// POST /api/admin/variants/:id/units — yeni paket birimi; isteğe bağlı liste fiyatıyla.
export function POST(req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "products.manage");
    const input = await parseBody(req, upsertVariantUnitSchema);
    const unit = await createVariantUnit(params.id, input, user.id);
    return Response.json({ unit }, { status: 201 });
  });
}
