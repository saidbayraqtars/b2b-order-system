import { rotateErpAgentToken } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

type Params = { params: { id: string } };

// POST /api/admin/erp/agents/:id/rotate — yeni token, eskisi anında geçersiz.
//
// No overlap window on purpose: rotation happens because a token leaked or a
// machine was replaced, and in both of those "the old one still works for a
// while" is precisely what must not be true.
export function POST(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "erp.manage");
    return Response.json(await rotateErpAgentToken(params.id));
  });
}
