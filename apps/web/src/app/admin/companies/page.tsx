import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { LinkButton } from "@/components/form";
import { CompaniesList } from "./_components/companies-list";

export default async function AdminCompaniesPage() {
  await requirePage(["SUPER_ADMIN"], "companies.view");

  return (
    <main className="mx-auto max-w-6xl">
      <PageHeader
        title="Firmalar"
        subtitle="Cari hesaplar, limitleri ve vadeleri."
        actions={
          <LinkButton href="/admin/companies/new" variant="primary" size="md">
            Yeni firma
          </LinkButton>
        }
      />
      <CompaniesList />
    </main>
  );
}
