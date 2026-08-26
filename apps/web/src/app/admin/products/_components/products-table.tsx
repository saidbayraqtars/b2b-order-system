"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import type { AdminCategoryRow, AdminProductRow } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import {
  Badge,
  EmptyState,
  LoadingState,
  TBody,
  THead,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { Button, ErrorLine, Select, TextInput } from "@/components/form";

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

      {products.isLoading && <LoadingState />}
      <ErrorLine error={products.error} />

      {products.isSuccess && rows.length === 0 && (
        <EmptyState label="Ürün bulunamadı. Sağ üstten yeni ürün ekleyebilirsiniz." />
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line bg-panel">
          <Table>
            <THead>
              <tr>
                <Th>Ürün</Th>
                <Th>Kategori</Th>
                <Th align="right">KDV</Th>
                <Th align="right">Varyant</Th>
                <Th align="right">Stok</Th>
                <Th>Durum</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.brand && (
                      <span className="ml-2 text-xs text-ink-faint">
                        {p.brand}
                      </span>
                    )}
                  </Td>
                  <Td muted>{p.category.name}</Td>
                  <Td align="right" numeric>
                    %{p.vatRate}
                  </Td>
                  <Td align="right" numeric>
                    <span className="inline-flex items-center gap-1">
                      {p.variantCount}
                      {/* Fiyatsız varyant sipariş edilemez; künye yerine ikon,
                          çünkü bu bir durum değil bir uyarı. */}
                      {p.unpricedVariants > 0 && (
                        <AlertTriangle
                          className="h-3.5 w-3.5 text-caution"
                          aria-label={`${p.unpricedVariants} varyantın fiyatı yok — sipariş edilemez`}
                        />
                      )}
                    </span>
                  </Td>
                  <Td align="right" numeric>
                    {p.totalStock}
                  </Td>
                  <Td>
                    <Badge tone={p.isActive ? "success" : "neutral"}>
                      {p.isActive ? "Aktif" : "Pasif"}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
