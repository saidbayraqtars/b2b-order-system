import { Prisma, prisma } from "@repo/database";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/companies — the customer list the caller may act on:
//  - SALES_REP: their own portfolio (Company.salesRepId)
//  - COMPANY_ADMIN / COMPANY_STAFF: only their own company
//  - SUPER_ADMIN: everyone
// Used by the mobile rep app to pick a customer for orders / check-in / collection.
export function GET() {
  return withAuthErrors(async () => {
    const user = await requireUser();

    let where: Prisma.CompanyWhereInput;
    switch (user.role) {
      case "SALES_REP":
        where = { salesRepId: user.id };
        break;
      case "COMPANY_ADMIN":
      case "COMPANY_STAFF":
        // companyId may be null for a misconfigured account — match nothing.
        where = { id: user.companyId ?? "__none__" };
        break;
      case "SUPER_ADMIN":
        where = {};
        break;
    }

    const rows = await prisma.company.findMany({
      where: { ...where, isActive: true },
      select: {
        id: true,
        name: true,
        phone: true,
        creditLimit: true,
        currentBalance: true,
        currency: true,
        addresses: {
          where: { isDefault: true },
          select: { city: true, district: true },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    const companies = rows.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      creditLimit: c.creditLimit.toFixed(2),
      currentBalance: c.currentBalance.toFixed(2),
      availableCredit: c.creditLimit.minus(c.currentBalance).toFixed(2),
      currency: c.currency,
      city: c.addresses[0]?.city ?? null,
      district: c.addresses[0]?.district ?? null,
    }));

    return Response.json({ companies });
  });
}
