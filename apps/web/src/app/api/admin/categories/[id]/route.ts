import type { NextRequest } from "next/server";
import { deleteCategory, updateCategory } from "@repo/services";
import { updateCategorySchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

// PATCH /api/admin/categories/:id
export function PATCH(req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, updateCategorySchema);
    const category = await updateCategory(params.id, input);
    return Response.json({ category });
  });
}

// DELETE /api/admin/categories/:id — refused if it has children, products or discounts.
export function DELETE(_req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    await deleteCategory(params.id);
    return new Response(null, { status: 204 });
  });
}
