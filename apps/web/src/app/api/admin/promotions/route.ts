import { createPromotion, listPromotions } from "@repo/services";
import { createPromotionSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET  /api/admin/promotions — campaign list with usage counters.
// POST /api/admin/promotions — create one; rules are compiled before they store.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "promotions.manage");
    return Response.json({ promotions: await listPromotions() });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "promotions.manage");
    const input = await parseBody(req, createPromotionSchema);

    return Response.json(await createPromotion(input), { status: 201 });
  });
}
