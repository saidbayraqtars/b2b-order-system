import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "../_components/product-form";

export default async function NewProductPage() {
  await requirePage(["SUPER_ADMIN"], "products.manage");
  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader
        title="Yeni Ürün"
        subtitle="Ürünü kaydettikten sonra varyant ve fiyat kademelerini ekleyebilirsiniz."
        back={{ href: "/admin/products", label: "Ürünler" }}
      />
      <ProductForm />
    </main>
  );
}
