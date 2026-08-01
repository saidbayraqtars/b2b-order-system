import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { AdminNav } from "../../../_components/admin-nav";
import { StatementView } from "@/components/statement-view";

export default async function AdminCompanyStatementPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requirePage(["SUPER_ADMIN"]);

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <AdminNav email={user.email} current="/admin" />
      <Link
        href={`/admin/companies/${company.id}`}
        className="mb-3 inline-block text-sm text-neutral-500 hover:underline"
      >
        ← {company.name}
      </Link>

      <h1 className="mb-6 text-xl font-bold">Cari Ekstre · {company.name}</h1>

      <StatementView companyId={company.id} />
    </main>
  );
}
