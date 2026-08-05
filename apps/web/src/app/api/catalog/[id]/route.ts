import type { NextRequest } from "next/server";
import { getCatalogProduct } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";

type Params = { params: { id: string } };

// GET /api/catalog/:id?companyId= — one product, priced for that company.
export function GET(req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser([
      "COMPANY_ADMIN",
      "COMPANY_STAFF",
      "SALES_REP",
      "SUPER_ADMIN",
    ]);
    const { searchParams } = new URL(req.url);
    const companyId = await resolveCompanyId(user, searchParams.get("companyId"));

    const product = await getCatalogProduct(params.id, companyId);
    if (!product) {
      return Response.json({ error: "Ürün bulunamadı" }, { status: 404 });
    }
    return Response.json({ product });
  });
}
