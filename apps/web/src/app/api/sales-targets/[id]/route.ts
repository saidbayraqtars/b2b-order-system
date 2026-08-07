import { deleteSalesTarget } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

/** DELETE /api/sales-targets/:id — hedefi kaldır. */
export function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    await requireUser(undefined, "targets.manage");
    await deleteSalesTarget(params.id);
    return new Response(null, { status: 204 });
  });
}
