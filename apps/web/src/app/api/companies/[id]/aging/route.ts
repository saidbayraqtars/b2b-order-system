import { getCompanyAging } from "@repo/services";
import { resolveCompanyId } from "@/lib/company-access";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/companies/:id/aging — one company's receivables aged by days past due.
export function GET(_req: Request, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser();
    const companyId = await resolveCompanyId(user, params.id);

    return Response.json(await getCompanyAging(companyId));
  });
}
