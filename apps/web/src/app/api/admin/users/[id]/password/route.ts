import { setUserPassword } from "@repo/services";
import { setPasswordSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";
import { userAdminContext, USER_ADMIN_ROLES } from "@/lib/user-admin-context";

// POST /api/admin/users/:id/password — set a password.
// Separate from the profile edit so a password can never be changed as a side
// effect of saving a form. Returns no body; the new password is never echoed.
export function POST(req: Request, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(USER_ADMIN_ROLES, "users.manage");
    const { password } = await parseBody(req, setPasswordSchema);

    await setUserPassword(params.id, password, userAdminContext(user));
    return new Response(null, { status: 204 });
  });
}
