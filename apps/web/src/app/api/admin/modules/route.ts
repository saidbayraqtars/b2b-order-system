import { listModules } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/admin/modules — modüller, açık/kapalı ve süren işleriyle.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "organization.manage");
    return Response.json({ modules: await listModules() });
  });
}
