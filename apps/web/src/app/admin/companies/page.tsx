import Link from "next/link";
import { requirePage } from "@/lib/guard";
import { AdminNav } from "../_components/admin-nav";
import { CompaniesList } from "./_components/companies-list";

export default async function AdminCompaniesPage() {
  const user = await requirePage(["SUPER_ADMIN"]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <AdminNav email={user.email} current="/admin/companies" />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Firmalar</h1>
        <Link
          href="/admin/companies/new"
          className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium leading-9 text-white"
        >
          Yeni firma
        </Link>
      </div>
      <CompaniesList />
    </main>
  );
}
