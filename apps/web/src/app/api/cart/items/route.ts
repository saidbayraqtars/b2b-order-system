import type { NextRequest } from "next/server";
import { upsertCartItem } from "@repo/services";
import { upsertCartItemSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";
import { parseBody } from "@/lib/validate";

const BUYERS = ["COMPANY_ADMIN", "COMPANY_STAFF", "SALES_REP", "SUPER_ADMIN"] as const;

// POST /api/cart/items — add/set/remove one line without sending the rest.
// Quantity 0 removes it; `increment: true` adds to what is already there, which
// is what "sepete ekle" on a product card means.
export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(BUYERS);
    const input = await parseBody(req, upsertCartItemSchema);
    await resolveCompanyId(user, input.companyId);
    return Response.json(await upsertCartItem(input, user.id));
  });
}
