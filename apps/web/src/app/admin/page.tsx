import { requirePage } from "@/lib/guard";
import { OrdersBoard } from "@/components/orders-board";
import { AdminNav } from "./_components/admin-nav";
import { CompaniesTable } from "./_components/companies-table";

// Server-gated too (defense in depth beyond middleware).
export default async function AdminDashboard() {
  const user = await requirePage(["SUPER_ADMIN"]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <AdminNav email={user.email} current="/admin" />

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Cari Hesaplar</h2>
        <CompaniesTable />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Siparişler</h2>
        <OrdersBoard canApproveCredit />
      </section>
    </main>
  );
}
