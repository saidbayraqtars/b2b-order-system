import { listSyncIssues } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

type Params = { params: { id: string } };

// GET /api/admin/erp/runs/:id/issues — bu çalıştırmada inemeyen satırlar.
//
// The unmatched code is the useful part: it is what an operator pastes into the
// ERP to find out what the row belonged to, and then into the firma or ürün
// card to finish the mapping.
export function GET(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "erp.manage");
    return Response.json({ issues: await listSyncIssues(params.id) });
  });
}
