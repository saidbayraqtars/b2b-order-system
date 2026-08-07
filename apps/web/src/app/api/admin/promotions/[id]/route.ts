import { deletePromotion, getPromotion, updatePromotion } from "@repo/services";
import { updatePromotionSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

export function GET(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "promotions.manage");
    return Response.json({ promotion: await getPromotion(params.id) });
  });
}

export function PATCH(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "promotions.manage");
    const input = await parseBody(req, updatePromotionSchema);

    return Response.json(await updatePromotion(params.id, input));
  });
}

export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "promotions.manage");
    await deletePromotion(params.id);
    return new Response(null, { status: 204 });
  });
}
