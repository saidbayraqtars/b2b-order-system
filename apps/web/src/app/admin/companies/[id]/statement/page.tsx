import { notFound } from "next/navigation";
import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
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
    <main className="mx-auto max-w-5xl">
      <PageHeader
        title="Cari Ekstre"
        subtitle={company.name}
        back={{ href: `/admin/companies/${company.id}`, label: company.name }}
      />
      <StatementView companyId={company.id} />
    </main>
  );
}
