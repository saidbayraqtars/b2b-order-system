import type { NextRequest } from "next/server";
import { listCatalog } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";

// GET /api/catalog?companyId=&categoryId=&search=
// Products with prices resolved for the given company.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser([
      "COMPANY_ADMIN",
      "COMPANY_STAFF",
      "SALES_REP",
      "SUPER_ADMIN",
    ]);
    const { searchParams } = new URL(req.url);
    const companyId = await resolveCompanyId(user, searchParams.get("companyId"));

    const products = await listCatalog({
      companyId,
      categoryId: searchParams.get("categoryId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });
    return Response.json({ products });
  });
}
