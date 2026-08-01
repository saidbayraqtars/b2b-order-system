"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminProductDetail } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import { ProductForm } from "./product-form";
import { VariantList } from "./variant-list";

/** Loads one product, then renders its fields, variants and price tiers. */
export function ProductEditor({ productId }: { productId: string }) {
  const query = useQuery({
    queryKey: ["admin", "product", productId],
    queryFn: () =>
      apiGet<{ product: AdminProductDetail }>(`/api/admin/products/${productId}`),
  });

  if (query.isLoading) {
    return <p className="text-sm text-neutral-500">Yükleniyor…</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-red-600">{(query.error as Error).message}</p>;
  }

  const product = query.data!.product;

  return (
    <div className="space-y-4">
      {/* Remount the form when the loaded product changes so its local state
          starts from the fresh values rather than the previous product's. */}
      <ProductForm key={product.id} product={product} />
      <VariantList productId={product.id} variants={product.variants} />
    </div>
  );
}
