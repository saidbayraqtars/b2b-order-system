import { getStatement } from "@repo/services";
import { statementQuerySchema } from "@repo/types";
import { resolveCompanyId } from "@/lib/company-access";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseQuery } from "@/lib/validate";

// GET /api/companies/:id/statement?from&to — cari ekstre.
// Scope follows resolveCompanyId: a company user sees only its own account, a
// rep only its portfolio, a super admin any company.
export function GET(req: Request, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(undefined, "companies.view");
    const companyId = await resolveCompanyId(user, params.id);
    const range = parseQuery(req, statementQuerySchema);

    return Response.json(await getStatement(companyId, range));
  });
}
