import Link from "next/link";
import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { PortalClient } from "./_components/portal-client";

export default async function PortalPage() {
  const user = await requirePage([
    "COMPANY_ADMIN",
    "COMPANY_STAFF",
    "SUPER_ADMIN",
  ]);

  // Portal is a company-buyer surface; super admins have no company context.
  if (!user.companyId) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold">B2B Portal</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Bu ekran firma hesapları içindir.{" "}
          <Link href="/admin" className="underline">
            Yönetim paneline
          </Link>{" "}
          gidin.
        </p>
      </main>
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { name: true },
  });

  return (
    <PortalClient
      companyId={user.companyId}
      companyName={company?.name ?? "Firma"}
      userName={user.name}
      role={user.role}
    />
  );
}
