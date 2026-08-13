"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminCategoryRow, AdminProductDetail } from "@repo/services";
import { VAT_RATES } from "@repo/types";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextArea,
  TextInput,
} from "@/components/form";
import { ImagePicker } from "./image-picker";

interface FormState {
  name: string;
  categoryId: string;
  brand: string;
  vatRate: number;
  description: string;
  images: string;
  isActive: boolean;
}

function initialState(product?: AdminProductDetail): FormState {
  return {
    name: product?.name ?? "",
    categoryId: product?.categoryId ?? "",
    brand: product?.brand ?? "",
    vatRate: product?.vatRate ?? 20,
    description: product?.description ?? "",
    images: (product?.images ?? []).join("\n"),
    isActive: product?.isActive ?? true,
  };
}

/**
 * Create or edit a product's own fields. Variants and prices live in their own
 * panels — a new product has to exist before it can have either.
 */
export function ProductForm({ product }: { product?: AdminProductDetail }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialState(product));

  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () =>
      apiGet<{ categories: AdminCategoryRow[] }>("/api/admin/categories"),
  });

  const payload = () => ({
    name: form.name.trim(),
    categoryId: form.categoryId,
    brand: form.brand.trim() || null,
    vatRate: form.vatRate,
    description: form.description.trim() || null,
    images: form.images
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    isActive: form.isActive,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (product) {
        return apiPatch<{ product: { id: string } }>(
          `/api/admin/products/${product.id}`,
          payload(),
        );
      }
      return apiPost<{ product: { id: string } }>(
        "/api/admin/products",
        payload(),
      );
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["admin", "products"] });
      void qc.invalidateQueries({
        queryKey: ["admin", "product", res.product.id],
      });
      if (!product) router.push(`/admin/products/${res.product.id}`);
    },
  });

  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/admin/products/${product!.id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "products"] });
      router.push("/admin/products");
    },
  });

  const categoryOptions = categories.data?.categories ?? [];
  const canSave = form.name.trim().length > 0 && form.categoryId.length > 0;

  return (
    <Panel title={product ? "Ürün bilgileri" : "Yeni ürün"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Ürün adı</Label>
          <TextInput
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Örn. PET Şişe 500 ml"
          />
        </div>

        <div>
          <Label>Kategori</Label>
          <Select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          >
            <option value="">Seçin…</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {categoryOptions.length === 0 && categories.isSuccess && (
            <p className="mt-1 text-xs text-amber-600">
              Önce en az bir kategori tanımlayın.
            </p>
          )}
        </div>

        <div>
          <Label>Marka</Label>
          <TextInput
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
          />
        </div>

        <div>
          <Label>KDV oranı</Label>
          <Select
            value={form.vatRate}
            onChange={(e) =>
              setForm({ ...form, vatRate: Number(e.target.value) })
            }
          >
            {VAT_RATES.map((r) => (
              <option key={r} value={r}>
                %{r}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-end">
          <Checkbox
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            label="Aktif (katalogda görünür)"
          />
        </div>

        <div className="sm:col-span-2">
          <Label>Açıklama</Label>
          <TextArea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        <div className="sm:col-span-2">
          <Label hint="(ilk görsel kapak olarak kullanılır)">Görseller</Label>
          <ImagePicker
            value={form.images}
            onChange={(images) => setForm({ ...form, images })}
          />
        </div>
      </div>

      <ErrorLine error={save.error} />
      <ErrorLine error={remove.error} />

      <div className="mt-4 flex items-center gap-2">
        <Button
          onClick={() => save.mutate()}
          disabled={!canSave || save.isPending}
        >
          {save.isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        {product && (
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => {
              if (confirm(`"${product.name}" ürünü silinsin mi?`))
                remove.mutate();
            }}
          >
            Sil
          </Button>
        )}
      </div>
    </Panel>
  );
}
