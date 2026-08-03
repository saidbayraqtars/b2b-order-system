"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminCategoryRow,
  AdminProductRow,
  CompanyDiscountRow,
} from "@repo/services";
import type { DiscountType } from "@repo/types";
import { apiDelete, apiGet, apiPost } from "@/lib/fetcher";
import {
  Button,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";

type Target = "category" | "product";

/**
 * Company-specific discounts applied on top of the resolved group price.
 * A row targets a category or a product, never both — resolution picks the
 * product rule over the category rule.
 */
export function CompanyDiscounts({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<Target>("category");
  const [targetId, setTargetId] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("PERCENTAGE");
  const [value, setValue] = useState("");

  const discounts = useQuery({
    queryKey: ["admin", "discounts", companyId],
    queryFn: () =>
      apiGet<{ discounts: CompanyDiscountRow[] }>(
        `/api/admin/companies/${companyId}/discounts`,
      ),
  });

  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () =>
      apiGet<{ categories: AdminCategoryRow[] }>("/api/admin/categories"),
  });

  const products = useQuery({
    queryKey: ["admin", "products", "", ""],
    queryFn: () => apiGet<{ products: AdminProductRow[] }>("/api/admin/products"),
  });

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["admin", "discounts", companyId] });

  const create = useMutation({
    mutationFn: () =>
      apiPost(`/api/admin/companies/${companyId}/discounts`, {
        categoryId: target === "category" ? targetId : null,
        productId: target === "product" ? targetId : null,
        discountType,
        value: Number(value.replace(",", ".")),
      }),
    onSuccess: () => {
      setTargetId("");
      setValue("");
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/discounts/${id}`),
    onSuccess: invalidate,
  });

  const parsed = Number(value.replace(",", "."));
  const canSave = !!targetId && Number.isFinite(parsed) && parsed > 0;
  const rows = discounts.data?.discounts ?? [];

  return (
    <div className="space-y-4">
      <Panel title="Yeni iskonto">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label>Hedef</Label>
            <Select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value as Target);
                setTargetId("");
              }}
              className="w-32"
            >
              <option value="category">Kategori</option>
              <option value="product">Ürün</option>
            </Select>
          </div>

          <div>
            <Label>{target === "category" ? "Kategori" : "Ürün"}</Label>
            <Select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-56"
            >
              <option value="">Seçin…</option>
              {target === "category"
                ? (categories.data?.categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                : (products.data?.products ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
            </Select>
          </div>

          <div>
            <Label>Tür</Label>
            <Select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as DiscountType)}
              className="w-36"
            >
              <option value="PERCENTAGE">Yüzde (%)</option>
              <option value="FIXED">Sabit (₺/adet)</option>
            </Select>
          </div>

          <div>
            <Label>Değer</Label>
            <TextInput
              value={value}
              inputMode="decimal"
              onChange={(e) => setValue(e.target.value)}
              className="w-24"
            />
          </div>

          <Button disabled={!canSave || create.isPending} onClick={() => create.mutate()}>
            Ekle
          </Button>
        </div>
        <ErrorLine error={create.error} />
      </Panel>

      <Panel title={`Tanımlı iskontolar (${rows.length})`}>
        {discounts.isLoading && (
          <p className="text-sm text-neutral-500">Yükleniyor…</p>
        )}
        {rows.length === 0 && discounts.isSuccess && (
          <p className="text-sm text-neutral-500">
            Bu firmaya özel iskonto tanımlı değil.
          </p>
        )}

        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {d.productId ? "Ürün" : "Kategori"}
              </span>
              <span className="font-medium">
                {d.productName ?? d.categoryName ?? "—"}
              </span>
              <span className="tabular-nums">
                {d.discountType === "PERCENTAGE"
                  ? `%${Number(d.value)}`
                  : `${Number(d.value).toFixed(2)} ₺/adet`}
              </span>
              <Button
                variant="danger"
                className="ml-auto"
                disabled={remove.isPending}
                onClick={() => remove.mutate(d.id)}
              >
                Sil
              </Button>
            </li>
          ))}
        </ul>
        <ErrorLine error={remove.error} />
      </Panel>
    </div>
  );
}
