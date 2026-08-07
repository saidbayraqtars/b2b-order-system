import type { NextRequest } from "next/server";
import { deleteProduct, getProductAdmin, updateProduct } from "@repo/services";
import { updateProductSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

// GET /api/admin/products/:id — full detail incl. variants and their price tiers.
export function GET(_req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "products.view");
    const product = await getProductAdmin(params.id);
    return Response.json({ product });
  });
}

// PATCH /api/admin/products/:id
export function PATCH(req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "products.manage");
    const input = await parseBody(req, updateProductSchema);
    const product = await updateProduct(params.id, input);
    return Response.json({ product });
  });
}

// DELETE /api/admin/products/:id — refused once an order references a variant;
// deactivate via PATCH { isActive: false } instead.
export function DELETE(_req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "products.manage");
    await deleteProduct(params.id);
    return new Response(null, { status: 204 });
  });
}
