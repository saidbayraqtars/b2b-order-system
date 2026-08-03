import { createCompany, listCompanies } from "@repo/services";
import { createCompanySchema } from "@repo/types";
import { auditContext } from "@/lib/audit-context";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET  /api/admin/companies?search&includeInactive — cari list for the admin panel.
// POST /api/admin/companies — onboard a new customer.
export function GET(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const params = new URL(req.url).searchParams;

    const companies = await listCompanies({
      search: params.get("search") ?? undefined,
      includeInactive: params.get("includeInactive") === "1",
    });
    return Response.json({ companies });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, createCompanySchema);

    return Response.json(
      { company: await createCompany(input, auditContext(user)) },
      { status: 201 },
    );
  });
}
