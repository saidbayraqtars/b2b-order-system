import type { NextRequest } from "next/server";
import { listVariantPrices, upsertPrice } from "@repo/services";
import { upsertPriceSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

// GET /api/admin/variants/:id/prices
export function GET(_req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "products.view");
    const prices = await listVariantPrices(params.id);
    return Response.json({ prices });
  });
}

// POST /api/admin/variants/:id/prices — upsert by (group, minQuantity):
// re-posting the same tier updates its amount rather than erroring.
export function POST(req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "products.manage");
    const input = await parseBody(req, upsertPriceSchema);
    const price = await upsertPrice(params.id, input);
    return Response.json({ price }, { status: price.created ? 201 : 200 });
  });
}
