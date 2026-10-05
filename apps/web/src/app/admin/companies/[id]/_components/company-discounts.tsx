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
import { Badge, LoadingState } from "@/components/ui";
import {
  Button,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";
import { useToast } from "@/components/toast";

type Target = "category" | "product";

/**
 * Company-specific discounts applied on top of the resolved group price.
 * A row targets a category or a product, never both — resolution picks the
 * product rule over the category rule.
 *
 * Tek panel: başlıkta "Yeni iskonto" düğmesi, gövdede tanımlı iskontolar.
 * Önce iki ayrı kapalı panel vardı ("Yeni iskonto", "Tanımlı iskontolar");
 * hangisinin neyi tuttuğu başlığı açmadan anlaşılmıyordu. Adresler ve
 * Hesaplar da aynı düzende.
 */
export function CompanyDiscounts({
  companyId,
  canEdit,
}: {
  companyId: string;
  /** `pricing.manage`: ekleme ve silme düğmeleri yalnız onda çizilir. */
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
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
    // Seçim listeleri yalnız form açıkken: ürün listesi bütün kataloğu
    // getiriyor ve firma sayfasının her açılışında boşuna iniyordu.
    enabled: adding,
  });

  const products = useQuery({
    queryKey: ["admin", "products", "", ""],
    queryFn: () =>
      apiGet<{ products: AdminProductRow[] }>("/api/admin/products"),
    enabled: adding && target === "product",
  });

  const { notify } = useToast();
  const invalidate = (message = "Kaydedildi") => {
    void qc.invalidateQueries({ queryKey: ["admin", "discounts", companyId] });
    notify(message);
  };

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
      setAdding(false);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/discounts/${id}`),
    onSuccess: () => invalidate("İskonto kaldırıldı"),
  });

  const parsed = Number(value.replace(",", "."));
  const canSave = !!targetId && Number.isFinite(parsed) && parsed > 0;
  const rows = discounts.data?.discounts ?? [];

  return (
    <Panel
      title="Firmaya özel iskonto"
      collapsible
      defaultOpen={false}
      summary={rows.length === 0 ? "yok" : `${rows.length} tanım`}
      forceOpen={adding}
      action={
        canEdit && (
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            {adding ? "Vazgeç" : "Yeni iskonto"}
          </Button>
        )
      }
    >
      {adding && (
        <div className="mb-4 rounded border border-line bg-sunken p-3">
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
                onChange={(e) =>
                  setDiscountType(e.target.value as DiscountType)
                }
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

            <Button
              size="sm"
              disabled={!canSave || create.isPending}
              onClick={() => create.mutate()}
            >
              İskontoyu ekle
            </Button>
          </div>
          <ErrorLine error={create.error} />
        </div>
      )}

      {discounts.isLoading && <LoadingState />}
      {rows.length === 0 && discounts.isSuccess && (
        <p className="text-body-sm text-ink-faint">
          Bu firmaya özel iskonto tanımlı değil.
        </p>
      )}

      <ul className="divide-y divide-line">
        {rows.map((d) => (
          <li key={d.id} className="flex items-center gap-3 py-2 text-body-sm">
            <Badge>{d.productId ? "Ürün" : "Kategori"}</Badge>
            <span className="font-medium text-ink">
              {d.productName ?? d.categoryName ?? "—"}
            </span>
            <span className="tabular-nums">
              {d.discountType === "PERCENTAGE"
                ? `%${Number(d.value)}`
                : `${Number(d.value).toFixed(2)} ₺/adet`}
            </span>
            {canEdit && (
              <Button
                variant="dangerQuiet"
                size="sm"
                className="ml-auto"
                disabled={remove.isPending}
                onClick={() => {
                  const name = d.productName ?? d.categoryName ?? "bu";
                  if (confirm(`"${name}" iskontosu kaldırılsın mı?`))
                    remove.mutate(d.id);
                }}
              >
                Sil
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ErrorLine error={remove.error} />
    </Panel>
  );
}
