import Link from "next/link";
import { requirePage } from "@/lib/guard";
import { AdminNav } from "../../_components/admin-nav";
import { CompanyForm } from "../_components/company-form";

export default async function NewCompanyPage() {
  const user = await requirePage(["SUPER_ADMIN"]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <AdminNav email={user.email} current="/admin/companies" />
      <Link
        href="/admin/companies"
        className="mb-3 inline-block text-sm text-neutral-500 hover:underline"
      >
        ← Firmalar
      </Link>
      <h1 className="mb-5 text-xl font-bold">Yeni Firma</h1>
      <CompanyForm />
      <p className="mt-4 text-sm text-neutral-500">
        Firma oluşturulduktan sonra adres ve kullanıcı ekleyebilirsiniz.
      </p>
    </main>
  );
}
