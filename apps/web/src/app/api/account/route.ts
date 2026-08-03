import { getAccount, updateProfile } from "@repo/services";
import { updateProfileSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { requestMeta } from "@/lib/request-meta";
import { parseBody } from "@/lib/validate";

// GET   /api/account — the caller's own profile.
// PATCH /api/account — edit own name / phone.
//
// No role list: every authenticated user owns an account. The id always comes
// from the verified session, so there is no target to tamper with.
export function GET() {
  return withAuthErrors(async () => {
    const user = await requireUser();
    return Response.json({ account: await getAccount(user.id) });
  });
}

export function PATCH(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser();
    const input = await parseBody(req, updateProfileSchema);
    const account = await updateProfile(user.id, input, requestMeta());
    return Response.json({ account });
  });
}
