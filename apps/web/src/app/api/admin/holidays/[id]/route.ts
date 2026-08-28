import { deleteHoliday } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

type Params = { params: { id: string } };

// DELETE /api/admin/holidays/:id — günü takvimden çıkar.
export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "organization.manage");
    await deleteHoliday(params.id);
    return new Response(null, { status: 204 });
  });
}
