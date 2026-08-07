import { promotionRuleCatalog } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/admin/promotions/rules — the condition/action catalogue the builder
// renders its form from. Labels and parameter kinds only: the rules themselves
// stay on the server, where they are also the security boundary.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "promotions.manage");
    return Response.json(promotionRuleCatalog());
  });
}
