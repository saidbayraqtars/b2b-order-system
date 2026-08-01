import type { NextRequest } from "next/server";
import { deleteCompanyDiscount } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// DELETE /api/admin/discounts/:id
export function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    await deleteCompanyDiscount(params.id);
    return new Response(null, { status: 204 });
  });
}
