import { requirePage } from "@/lib/guard";
import { AdminNav } from "../_components/admin-nav";
import { ProductsTable } from "./_components/products-table";

export default async function AdminProductsPage() {
  const user = await requirePage(["SUPER_ADMIN"]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <AdminNav email={user.email} current="/admin/products" />
      <ProductsTable />
    </main>
  );
}
