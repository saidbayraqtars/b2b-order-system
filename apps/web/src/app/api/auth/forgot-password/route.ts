import { requestPasswordReset } from "@repo/services";
import { forgotPasswordSchema } from "@repo/types";
import { withAuthErrors } from "@/lib/guard";
import { requestMeta } from "@/lib/request-meta";
import { parseBody } from "@/lib/validate";

// POST /api/auth/forgot-password — ask for a reset link.
//
// Public by design, and deliberately uninformative: the answer is the same
// whether the address belongs to an account, to a deactivated account, or to
// nobody at all. Anything else turns this endpoint into a way of enumerating
// customers. The throttle lives in the service, not here, so it counts per
// account rather than per form submission.
export function POST(req: Request) {
  return withAuthErrors(async () => {
    const input = await parseBody(req, forgotPasswordSchema);
    await requestPasswordReset(input.email, requestMeta());
    return Response.json({
      ok: true,
      message:
        "E-posta adresi kayıtlıysa sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.",
    });
  });
}
