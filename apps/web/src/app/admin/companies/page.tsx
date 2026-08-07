import Link from "next/link";
import { requirePage } from "@/lib/guard";
import { CompaniesList } from "./_components/companies-list";

export default async function AdminCompaniesPage() {
  await requirePage(["SUPER_ADMIN"], "companies.view");

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
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
