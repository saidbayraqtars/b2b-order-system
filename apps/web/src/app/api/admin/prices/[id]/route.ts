import type { NextRequest } from "next/server";
import { deletePrice } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// DELETE /api/admin/prices/:id — drop one price tier.
export function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    await deletePrice(params.id);
    return new Response(null, { status: 204 });
  });
}
