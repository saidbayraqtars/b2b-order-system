import Link from "next/link";
import { requirePage } from "@/lib/guard";
import { ProductEditor } from "../_components/product-editor";

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  await requirePage(["SUPER_ADMIN"], "products.manage");
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Link
        href="/admin/products"
        className="mb-3 inline-block text-sm text-neutral-500 hover:underline"
      >
        ← Ürünler
      </Link>
      <ProductEditor productId={params.id} />
    </main>
  );
}
