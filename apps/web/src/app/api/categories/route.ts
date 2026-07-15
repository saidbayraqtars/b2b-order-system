import { listCategoryTree } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/categories — category tree (any authenticated user).
export function GET() {
  return withAuthErrors(async () => {
    await requireUser([
      "COMPANY_ADMIN",
      "COMPANY_STAFF",
      "SALES_REP",
      "SUPER_ADMIN",
    ]);
    const categories = await listCategoryTree();
    return Response.json({ categories });
  });
}
