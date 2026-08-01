import Link from "next/link";
import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { SignOutButton } from "@/components/sign-out-button";
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
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Cari Ekstre</h1>
          <p className="text-sm text-neutral-500">{company?.name ?? user.name}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/portal" className="text-sm underline">
            Katalog
          </Link>
          <Link href="/portal/orders" className="text-sm underline">
            Siparişlerim
          </Link>
          <SignOutButton />
        </div>
      </header>

      <StatementView companyId={user.companyId} />
    </main>
  );
}
