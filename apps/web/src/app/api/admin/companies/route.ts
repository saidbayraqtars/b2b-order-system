import { prisma } from "@repo/database";
import { requireUser, withAuthErrors } from "@/lib/guard";

// Example RBAC-protected endpoint: only SUPER_ADMIN may list all companies.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);

    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        creditLimit: true,
        currentBalance: true,
        isActive: true,
      },
      orderBy: { name: "asc" },
    });

    return Response.json({ companies });
  });
}
