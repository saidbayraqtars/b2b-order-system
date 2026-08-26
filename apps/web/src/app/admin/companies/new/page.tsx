import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { CompanyForm } from "../_components/company-form";

export default async function NewCompanyPage() {
  await requirePage(["SUPER_ADMIN"], "companies.manage");

  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader
        title="Yeni Firma"
        subtitle="Firma oluşturulduktan sonra adres ve kullanıcı ekleyebilirsiniz."
        back={{ href: "/admin/companies", label: "Firmalar" }}
      />
      <CompanyForm />
    </main>
  );
}
