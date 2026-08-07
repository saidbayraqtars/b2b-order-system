import { requirePage } from "@/lib/guard";
import { ProductsTable } from "./_components/products-table";

export default async function AdminProductsPage() {
  await requirePage(["SUPER_ADMIN"], "products.view");
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <ProductsTable />
    </main>
  );
}
