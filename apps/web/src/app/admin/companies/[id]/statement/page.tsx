import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { StatementView } from "@/components/statement-view";

export default async function AdminCompanyStatementPage({
  params,
}: {
  params: { id: string };
}) {
  await requirePage(["SUPER_ADMIN"], "companies.view");

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
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
