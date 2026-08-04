import type { NextRequest } from "next/server";
import { clearCart, getCart, setCart } from "@repo/services";
import { setCartSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";
import { parseBody } from "@/lib/validate";

const BUYERS = ["COMPANY_ADMIN", "COMPANY_STAFF", "SALES_REP", "SUPER_ADMIN"] as const;

// The cart belongs to (company, caller). There is no way to read or write
// someone else's: the owner is always the session's own id, never a parameter.

// GET /api/cart?companyId= — the caller's cart, priced for that company.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(BUYERS);
    const companyId = await resolveCompanyId(
      user,
      new URL(req.url).searchParams.get("companyId"),
    );
    return Response.json(await getCart(companyId, user.id));
  });
}

// PUT /api/cart — replace the whole cart (last write wins).
export function PUT(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(BUYERS);
    const input = await parseBody(req, setCartSchema);
    await resolveCompanyId(user, input.companyId);
    return Response.json(await setCart(input, user.id));
  });
}

// DELETE /api/cart?companyId= — empty it.
export function DELETE(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(BUYERS);
    const companyId = await resolveCompanyId(
      user,
      new URL(req.url).searchParams.get("companyId"),
    );
    await clearCart(companyId, user.id);
    return Response.json({ ok: true });
  });
}
