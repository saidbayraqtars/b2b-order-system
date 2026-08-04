import { completePasswordReset } from "@repo/services";
import { resetPasswordSchema } from "@repo/types";
import { withAuthErrors } from "@/lib/guard";
import { requestMeta } from "@/lib/request-meta";
import { parseBody } from "@/lib/validate";

// POST /api/auth/reset-password — spend a reset link.
//
// The token *is* the authentication here, so there is no requireUser: proving
// control of the mailbox is the whole point. Succeeding revokes every session
// the account had, which is why the client is told to send the user to /login.
export function POST(req: Request) {
  return withAuthErrors(async () => {
    const input = await parseBody(req, resetPasswordSchema);
    await completePasswordReset(input, requestMeta());
    return Response.json({ ok: true, sessionRevoked: true });
  });
}
