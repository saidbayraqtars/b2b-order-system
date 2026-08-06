import { getMappingStatus, listSyncRuns } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/admin/erp/runs — eşitleme geçmişi + eşleme durumu.
//
// The two travel together because they answer one question between them: is the
// bridge working, and is the mapping finished? A run that applied 12 of 4.000
// rows looks fine on its own.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const [runs, mapping] = await Promise.all([listSyncRuns(), getMappingStatus()]);
    return Response.json({ runs, mapping });
  });
}
