import type { NextRequest } from "next/server";
import { deleteVariant, updateVariant } from "@repo/services";
import { updateVariantSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

// PATCH /api/admin/variants/:id — also the stock-adjustment endpoint.
export function PATCH(req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "products.manage");
    const input = await parseBody(req, updateVariantSchema);
    const variant = await updateVariant(params.id, input);
    return Response.json({ variant });
  });
}

// DELETE /api/admin/variants/:id — refused once an order references it.
export function DELETE(_req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "products.manage");
    await deleteVariant(params.id);
    return new Response(null, { status: 204 });
  });
}
