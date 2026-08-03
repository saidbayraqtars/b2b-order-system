import { changeOwnPassword } from "@repo/services";
import { changePasswordSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { requestMeta } from "@/lib/request-meta";
import { parseBody } from "@/lib/validate";

// POST /api/account/password — change your own password.
//
// Separate from PATCH /api/account so a password can never change as a side
// effect of a profile save. Succeeding revokes every session including this
// one, which is why the response says so: the client must send the user back
// to the login screen.
export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser();
    const input = await parseBody(req, changePasswordSchema);
    await changeOwnPassword(user.id, input, requestMeta());
    return Response.json({ ok: true, sessionRevoked: true });
  });
}
