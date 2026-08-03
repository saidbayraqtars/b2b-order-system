import { deleteCompany, getCompany, updateCompany } from "@repo/services";
import { updateCompanySchema } from "@repo/types";
import { auditContext } from "@/lib/audit-context";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

export function GET(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    return Response.json({ company: await getCompany(params.id) });
  });
}

export function PATCH(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, updateCompanySchema);

    return Response.json({
      company: await updateCompany(params.id, input, auditContext(user)),
    });
  });
}

export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"]);
    await deleteCompany(params.id, auditContext(user));
    return new Response(null, { status: 204 });
  });
}
