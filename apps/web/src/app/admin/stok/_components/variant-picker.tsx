"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StockLevelRow } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import { Label, Select, TextInput } from "@/components/form";

// Hareket girerken ürünü seçmenin yolu: ara, sonra çıkan listeden seç.
//
// Seçenek listesinde **defterdeki adet de yazıyor**. Sayım ya da fire girerken
// sorulan ilk soru zaten "şu an kaç görünüyor"; onu göstermeyen bir seçici,
// kullanıcıyı ekranın başka bir yerine bakmaya gönderiyordu.

export function useVariantSearch(search: string) {
  return useQuery({
    queryKey: ["stock-levels", "picker", search],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "50" });
      if (search.trim()) params.set("q", search.trim());
      return apiGet<{ levels: StockLevelRow[] }>(`/api/admin/stock?${params}`);
    },
  });
}

export function VariantPicker({
  value,
  onChange,
  label = "Ürün",
}: {
  value: string;
  onChange: (variantId: string) => void;
  label?: string;
}) {
  const [search, setSearch] = useState("");
  const levels = useVariantSearch(search);
  const rows = levels.data?.levels ?? [];

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label>
        <Label>Ara</Label>
        <TextInput
          value={search}
          placeholder="SKU, barkod, ürün adı"
          onChange={(e) => setSearch(e.target.value)}
          className="w-44"
        />
      </label>
      <label className="min-w-56 flex-1">
        <Label>{label}</Label>
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Seçin</option>
          {rows.map((r) => (
            <option key={r.variantId} value={r.variantId}>
              {r.productName} — {r.sku} ({r.stock} {r.unit ?? "adet"})
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}
