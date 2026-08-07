import { hasPermission } from "@repo/types";
import { requirePage } from "@/lib/guard";
import { OrdersBoard } from "@/components/orders-board";
import { CompaniesTable } from "./_components/companies-table";

// Server-gated too (defense in depth beyond middleware).
//
// Panelin kendisi izin istemez — yetkisi kısılmış bir yöneticinin girebileceği
// bir yer kalmalı. Panonun *bölümleri* izne bakar; hepsi kapalıysa ekran boş
// değil, ne eksik olduğunu söyleyen bir satır gösterir.
export default async function AdminDashboard() {
  const user = await requirePage(["SUPER_ADMIN"]);
  const canSeeCompanies = hasPermission(user.permissions, "companies.view");
  const canSeeOrders = hasPermission(user.permissions, "orders.view");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {canSeeCompanies && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-neutral-800 dark:text-neutral-100">
            Cari Hesaplar
          </h2>
          <CompaniesTable />
        </section>
      )}

      {canSeeOrders && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-neutral-800 dark:text-neutral-100">
            Siparişler
          </h2>
          <OrdersBoard
            canApproveCredit={hasPermission(user.permissions, "orders.approve")}
          />
        </section>
      )}

      {!canSeeCompanies && !canSeeOrders && (
        <p className="mx-auto max-w-md py-16 text-center text-sm text-neutral-500">
          Hesabınızda görüntüleyebileceğiniz bir bölüm yok. Yetki için sistem
          yöneticinize başvurun.
        </p>
      )}
    </div>
  );
}
