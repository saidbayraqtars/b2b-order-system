import type { NextRequest } from "next/server";
import { deleteVariantUnit, updateVariantUnit } from "@repo/services";
import { updateVariantUnitSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

// PATCH /api/admin/variant-units/:id — ad, çarpan, barkod, fiyat. Çarpan
// değişse de geçmiş siparişin künyesi değişmez: satır kendi çarpanını taşır.
export function PATCH(req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "products.manage");
    const input = await parseBody(req, updateVariantUnitSchema);
    const unit = await updateVariantUnit(params.id, input);
    return Response.json({ unit });
  });
}

// DELETE /api/admin/variant-units/:id — geçmiş siparişler adını ve çarpanını korur.
export function DELETE(_req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "products.manage");
    await deleteVariantUnit(params.id);
    return new Response(null, { status: 204 });
  });
}
