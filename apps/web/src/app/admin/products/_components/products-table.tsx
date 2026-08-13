"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { AdminCategoryRow, AdminProductRow } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import { LoadingState } from "@/components/ui";
import { Button, Select, TextInput } from "@/components/form";

export function ProductsTable() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () =>
      apiGet<{ categories: AdminCategoryRow[] }>("/api/admin/categories"),
  });

  const params = new URLSearchParams();
  if (query) params.set("search", query);
  if (categoryId) params.set("categoryId", categoryId);
  const qs = params.toString();

  const products = useQuery({
    queryKey: ["admin", "products", query, categoryId],
    queryFn: () =>
      apiGet<{ products: AdminProductRow[] }>(
        `/api/admin/products${qs ? `?${qs}` : ""}`,
      ),
  });

  const rows = products.data?.products ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            value={search}
            placeholder="Ürün adı, marka veya SKU"
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setQuery(search.trim());
            }}
            className="w-64"
          />
          <Button variant="secondary" onClick={() => setQuery(search.trim())}>
            Ara
          </Button>
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-52"
          >
            <option value="">Tüm kategoriler</option>
            {(categories.data?.categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <Link
          href="/admin/products/new"
          className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium leading-9 text-white hover:bg-indigo-700"
        >
          Yeni ürün
        </Link>
      </div>

      {products.isLoading && <LoadingState />}
      {products.isError && (
        <p className="text-sm text-red-600">
          {(products.error as Error).message}
        </p>
      )}

      {products.isSuccess && rows.length === 0 && (
        <p className="text-sm text-neutral-500">
          Ürün bulunamadı. Sağ üstten yeni ürün ekleyebilirsiniz.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2">Ürün</th>
                <th className="px-3 py-2">Kategori</th>
                <th className="px-3 py-2 text-right">KDV</th>
                <th className="px-3 py-2 text-right">Varyant</th>
                <th className="px-3 py-2 text-right">Stok</th>
                <th className="px-3 py-2">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.brand && (
                      <span className="ml-2 text-xs text-neutral-400">
                        {p.brand}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-neutral-500">
                    {p.category.name}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    %{p.vatRate}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p.variantCount}
                    {p.unpricedVariants > 0 && (
                      <span
                        className="ml-1 text-amber-600"
                        title={`${p.unpricedVariants} varyantın fiyatı yok — sipariş edilemez`}
                      >
                        ⚠
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p.totalStock}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        p.isActive
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-neutral-200 text-neutral-600"
                      }`}
                    >
                      {p.isActive ? "Aktif" : "Pasif"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
