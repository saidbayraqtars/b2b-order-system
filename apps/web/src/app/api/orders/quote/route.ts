import type { NextRequest } from "next/server";
import { quoteOrder } from "@repo/services";
import { quoteOrderSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";
import { parseBody } from "@/lib/validate";

const ALL_BUYERS = [
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
  "SALES_REP",
  "SUPER_ADMIN",
] as const;

// POST /api/orders/quote — price a cart without placing it.
//
// The portal cannot total a cart on its own any more: campaigns depend on rules
// the browser never sees. Same calculation as order creation, so what the cart
// shows is what the order will charge.
export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(ALL_BUYERS);
    const input = await parseBody(req, quoteOrderSchema);

    await resolveCompanyId(user, input.companyId);

    // Freight is a seller-side figure — the same rule order creation applies,
    // so a buyer cannot make a shipping campaign fire by inventing a delivery
    // charge in the preview.
    const isSeller = user.role === "SUPER_ADMIN" || user.role === "SALES_REP";

    return Response.json(
      await quoteOrder({
        ...input,
        shippingFee: isSeller ? input.shippingFee : 0,
      }),
    );
  });
}
