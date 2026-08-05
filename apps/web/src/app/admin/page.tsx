import { requirePage } from "@/lib/guard";
import { OrdersBoard } from "@/components/orders-board";
import { AdminNav } from "./_components/admin-nav";
import { CompaniesTable } from "./_components/companies-table";

// Server-gated too (defense in depth beyond middleware).
export default async function AdminDashboard() {
  const user = await requirePage(["SUPER_ADMIN"]);
  return (
    <div>
      <AdminNav email={user.email} current="/admin" />
      <div className="mx-auto max-w-6xl px-4 pb-8">
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-neutral-800 dark:text-neutral-100">
            Cari Hesaplar
          </h2>
          <CompaniesTable />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-neutral-800 dark:text-neutral-100">
            Siparişler
          </h2>
          <OrdersBoard canApproveCredit />
        </section>
      </div>
    </div>
  );
}
