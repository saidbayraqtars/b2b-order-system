import type { NextRequest } from "next/server";
import { createCompanyDiscount, listCompanyDiscounts } from "@repo/services";
import { createCompanyDiscountSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

// GET /api/admin/companies/:id/discounts
export function GET(_req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "companies.view");
    const discounts = await listCompanyDiscounts(params.id);
    return Response.json({ discounts });
  });
}

// POST /api/admin/companies/:id/discounts — target a category OR a product,
// never both (resolution is product-over-category).
export function POST(req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "companies.manage");
    const input = await parseBody(req, createCompanyDiscountSchema);
    const discount = await createCompanyDiscount(params.id, input);
    return Response.json({ discount }, { status: 201 });
  });
}
