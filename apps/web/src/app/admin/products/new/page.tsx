import Link from "next/link";
import { requirePage } from "@/lib/guard";
import { ProductForm } from "../_components/product-form";

export default async function NewProductPage() {
  await requirePage(["SUPER_ADMIN"], "products.manage");
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Link
        href="/admin/products"
        className="mb-3 inline-block text-sm text-neutral-500 hover:underline"
      >
        ← Ürünler
      </Link>
      <ProductForm />
      <p className="mt-3 text-sm text-neutral-500">
        Ürünü kaydettikten sonra varyant ve fiyat kademelerini ekleyebilirsiniz.
      </p>
    </main>
  );
}
