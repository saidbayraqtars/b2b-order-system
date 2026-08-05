import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { PortalNav } from "@/components/portal-nav";
import { StatementView } from "@/components/statement-view";

// The buying company's own cari ekstre. Super admins are not routed here —
// they read any company's statement from /admin/companies/:id/statement.
export default async function PortalStatementPage() {
  const user = await requirePage(["COMPANY_ADMIN", "COMPANY_STAFF"]);

  if (!user.companyId) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold">Cari Ekstre</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Hesabınıza firma atanmamış.
        </p>
      </main>
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { name: true },
  });

  return (
    <div>
      <PortalNav
        role={user.role}
        companyName={company?.name ?? user.name}
        userName={user.name}
        current="/portal/statement"
      />
      <div className="mx-auto max-w-5xl px-4 pb-6">
        <h1 className="mb-4 text-lg font-semibold">Cari Ekstre</h1>
        <StatementView companyId={user.companyId} />
      </div>
    </div>
  );
}
