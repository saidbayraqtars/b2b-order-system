import { deleteUser, getUser, updateUser } from "@repo/services";
import { updateUserSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";
import { userAdminContext, USER_ADMIN_ROLES } from "@/lib/user-admin-context";

type Params = { params: { id: string } };

export function GET(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(USER_ADMIN_ROLES);
    return Response.json({ user: await getUser(params.id, userAdminContext(user)) });
  });
}

export function PATCH(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(USER_ADMIN_ROLES);
    const input = await parseBody(req, updateUserSchema);

    return Response.json({
      user: await updateUser(params.id, input, userAdminContext(user)),
    });
  });
}

export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(USER_ADMIN_ROLES);
    await deleteUser(params.id, userAdminContext(user));
    return new Response(null, { status: 204 });
  });
}
