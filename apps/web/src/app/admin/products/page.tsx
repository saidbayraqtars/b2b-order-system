import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { LinkButton } from "@/components/form";
import { ProductsTable } from "./_components/products-table";

export default async function AdminProductsPage() {
  await requirePage(["SUPER_ADMIN"], "products.view");
  return (
    <main className="mx-auto max-w-6xl">
      <PageHeader
        title="Ürünler"
        subtitle="Katalog kalemleri, varyantları ve stok durumu."
        actions={
          <LinkButton href="/admin/products/new" variant="primary" size="md">
            Yeni ürün
          </LinkButton>
        }
      />
      <ProductsTable />
    </main>
  );
}
