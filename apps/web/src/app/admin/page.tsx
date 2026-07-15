import { requirePage } from "@/lib/guard";
import { SignOutButton } from "@/components/sign-out-button";
import { OrdersBoard } from "@/components/orders-board";
import { CompaniesTable } from "./_components/companies-table";

// Server-gated too (defense in depth beyond middleware).
export default async function AdminDashboard() {
  const user = await requirePage(["SUPER_ADMIN"]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Yönetim Paneli</h1>
          <p className="text-sm text-neutral-500">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

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
