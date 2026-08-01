import { requirePage } from "@/lib/guard";
import { AdminNav } from "../_components/admin-nav";
import { ReportsClient } from "./_components/reports-client";

export default async function AdminReportsPage() {
  const user = await requirePage(["SUPER_ADMIN"]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <AdminNav email={user.email} current="/admin/reports" />
      <h1 className="mb-5 text-xl font-bold">Raporlar</h1>
      <ReportsClient />
    </main>
  );
}
