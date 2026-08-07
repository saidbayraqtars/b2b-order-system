import { requirePage } from "@/lib/guard";
import { ReportsClient } from "./_components/reports-client";

export default async function AdminReportsPage() {
  await requirePage(["SUPER_ADMIN"], "reports.view");

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-5 text-xl font-bold">Raporlar</h1>
      <ReportsClient />
    </main>
  );
}
