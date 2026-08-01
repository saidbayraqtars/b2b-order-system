import Link from "next/link";
import { requirePage } from "@/lib/guard";
import { AdminNav } from "../../_components/admin-nav";
import { ProductEditor } from "../_components/product-editor";

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requirePage(["SUPER_ADMIN"]);
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <AdminNav email={user.email} current="/admin/products" />
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
