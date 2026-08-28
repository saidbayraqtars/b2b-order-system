import { getOrderPolicy, saveOrderPolicy } from "@repo/services";
import { saveOrderPolicySchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET /api/admin/order-policy — sipariş kabul kuralları.
// PUT /api/admin/order-policy
//
// Okuma izni ayrı değil: kuralı **sepet** de okuyor ve orada kimse izin
// sormuyor — eşiğin ne olduğu zaten müşteriye söyleniyor. Buradaki kapı yazma
// için; okuma, ekranı açanın zaten gördüğü şeyi döndürüyor.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "order_policy.manage");
    return Response.json({ policy: await getOrderPolicy() });
  });
}

export function PUT(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "order_policy.manage");
    const input = await parseBody(req, saveOrderPolicySchema);
    return Response.json({ policy: await saveOrderPolicy(input, user.id) });
  });
}
