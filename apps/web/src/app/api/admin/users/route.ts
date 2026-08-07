import { createUser, listUsers } from "@repo/services";
import { createUserSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";
import { userAdminContext, USER_ADMIN_ROLES } from "@/lib/user-admin-context";

// GET  /api/admin/users?search&companyId&includeInactive
// POST /api/admin/users
//
// Open to COMPANY_ADMIN as well as SUPER_ADMIN: a company manages its own staff.
// The service pins a company admin to their own company and refuses the two
// system roles, so the wider role list here does not widen what they can do.
export function GET(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(USER_ADMIN_ROLES, "users.manage");
    const params = new URL(req.url).searchParams;

    const users = await listUsers(userAdminContext(user), {
      search: params.get("search") ?? undefined,
      companyId: params.get("companyId") ?? undefined,
      includeInactive: params.get("includeInactive") === "1",
    });
    return Response.json({ users });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(USER_ADMIN_ROLES, "users.manage");
    const input = await parseBody(req, createUserSchema);

    return Response.json(
      { user: await createUser(input, userAdminContext(user)) },
      { status: 201 },
    );
  });
}
