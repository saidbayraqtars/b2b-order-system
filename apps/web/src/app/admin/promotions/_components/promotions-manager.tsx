"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminProductRow,
  CategoryNode,
  CompanyRow,
  CustomerGroupRow,
  PromotionRow,
  VariantOption,
} from "@repo/services";
import type { PromotionRuleCatalog } from "@repo/types";
import { apiDelete, apiGet, apiPatch } from "@/lib/fetcher";
import { LoadingState } from "@/components/ui";
import { formatTRY } from "@/lib/format";
import { Button, ErrorLine, Panel } from "@/components/form";
import { PromotionForm } from "./promotion-form";
import type { RuleOptions } from "./rule-editor";

function flattenCategories(
  nodes: CategoryNode[],
  depth = 0,
): Array<{ id: string; name: string }> {
  return nodes.flatMap((n) => [
    { id: n.id, name: `${"— ".repeat(depth)}${n.name}` },
    ...flattenCategories(n.children, depth + 1),
  ]);
}

export function PromotionsManager() {
  const qc = useQueryClient();
  /** null = list only, "new" = blank form, otherwise the campaign being edited. */
  const [editing, setEditing] = useState<string | null>(null);

  const promotions = useQuery({
    queryKey: ["admin-promotions"],
    queryFn: () =>
      apiGet<{ promotions: PromotionRow[] }>("/api/admin/promotions"),
  });
  const rules = useQuery({
    queryKey: ["promotion-rules"],
    queryFn: () => apiGet<PromotionRuleCatalog>("/api/admin/promotions/rules"),
    staleTime: Infinity, // the catalogue only changes when the server does
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<{ categories: CategoryNode[] }>("/api/categories"),
  });
  const products = useQuery({
    queryKey: ["admin-products", "promotions"],
    queryFn: () =>
      apiGet<{ products: AdminProductRow[] }>("/api/admin/products"),
  });
  const groups = useQuery({
    queryKey: ["admin-customer-groups"],
    queryFn: () =>
      apiGet<{ groups: CustomerGroupRow[] }>("/api/admin/customer-groups"),
  });
  const companies = useQuery({
    queryKey: ["admin-companies", "promotions"],
    queryFn: () => apiGet<{ companies: CompanyRow[] }>("/api/admin/companies"),
  });
  const variants = useQuery({
    queryKey: ["admin-variants"],
    queryFn: () => apiGet<{ variants: VariantOption[] }>("/api/admin/variants"),
  });

  const options: RuleOptions = useMemo(
    () => ({
      categories: flattenCategories(categories.data?.categories ?? []),
      products: (products.data?.products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
      })),
      customerGroups: (groups.data?.groups ?? []).map((g) => ({
        id: g.id,
        name: g.name,
      })),
      companies: (companies.data?.companies ?? []).map((c) => ({
        id: c.id,
        name: c.name,
      })),
      variants: (variants.data?.variants ?? []).map((v) => ({
        id: v.id,
        name: v.name,
      })),
    }),
    [
      categories.data,
      products.data,
      groups.data,
      companies.data,
      variants.data,
    ],
  );

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["admin-promotions"] });

  const rows = promotions.data?.promotions ?? [];
  const current =
    editing && editing !== "new" ? rows.find((p) => p.id === editing) : null;

  return (
    <div className="flex flex-col gap-5">
      {editing && rules.data && (
        <PromotionForm
          key={editing}
          initial={current ?? null}
          catalog={rules.data}
          options={options}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <Panel
        title="Kampanyalar"
        action={
          !editing && (
            <Button onClick={() => setEditing("new")}>Yeni kampanya</Button>
          )
        }
      >
        {promotions.isLoading && <LoadingState />}
        <ErrorLine error={promotions.error ?? rules.error} />

        {promotions.data && rows.length === 0 && (
          <p className="text-sm text-neutral-500">
            Henüz kampanya yok. Kampanya, koşul + aksiyon olarak tanımlanır;
            fiyat ve firma iskontosunun üzerine uygulanır.
          </p>
        )}

        <ul className="space-y-2">
          {rows.map((p) => (
            <PromotionRowItem
              key={p.id}
              promotion={p}
              onEdit={() => setEditing(p.id)}
              onChanged={invalidate}
            />
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function PromotionRowItem({
  promotion,
  onEdit,
  onChanged,
}: {
  promotion: PromotionRow;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const toggle = useMutation({
    mutationFn: () =>
      apiPatch(`/api/admin/promotions/${promotion.id}`, {
        enabled: !promotion.enabled,
      }),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/admin/promotions/${promotion.id}`),
    onSuccess: onChanged,
  });

  const window = [
    promotion.startsAt
      ? new Date(promotion.startsAt).toLocaleDateString("tr-TR")
      : null,
    promotion.endsAt
      ? new Date(promotion.endsAt).toLocaleDateString("tr-TR")
      : null,
  ];
  const windowLabel =
    window[0] || window[1]
      ? `${window[0] ?? "başlangıçsız"} → ${window[1] ?? "süresiz"}`
      : "süresiz";

  const limits = [
    promotion.usageLimit !== null ? `toplam ${promotion.usageLimit}` : null,
    promotion.perCompanyLimit !== null
      ? `firma başına ${promotion.perCompanyLimit}`
      : null,
  ].filter(Boolean);

  return (
    <li className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium">
            {promotion.name}
            {promotion.code && (
              <span className="ml-2 rounded bg-indigo-100 px-2 py-0.5 font-mono text-xs text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                {promotion.code}
              </span>
            )}
            {!promotion.enabled && (
              <span className="ml-2 rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                pasif
              </span>
            )}
          </p>
          <p className="text-neutral-500">
            {promotion.conditions.length} koşul · {promotion.actions.length}{" "}
            aksiyon · öncelik {promotion.priority}
            {promotion.stopFurther ? " · tekil" : ""} · {windowLabel}
            {limits.length > 0 ? ` · limit: ${limits.join(", ")}` : ""}
          </p>
          <p className="text-neutral-500">
            {promotion.usedCount} siparişte kullanıldı ·{" "}
            {formatTRY(Number(promotion.discountGranted))} indirim
          </p>
        </div>

        <div className="flex gap-1">
          <Button variant="secondary" onClick={onEdit}>
            Düzenle
          </Button>
          <Button
            variant="secondary"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate()}
          >
            {promotion.enabled ? "Pasife al" : "Aktifleştir"}
          </Button>
          <Button
            variant="danger"
            disabled={promotion.usedCount > 0 || remove.isPending}
            title={
              promotion.usedCount > 0
                ? "Siparişlerde kullanılmış kampanya silinemez, pasife alın"
                : undefined
            }
            onClick={() => {
              if (confirm(`"${promotion.name}" kampanyası silinsin mi?`)) {
                remove.mutate();
              }
            }}
          >
            Sil
          </Button>
        </div>
      </div>
      <ErrorLine error={toggle.error ?? remove.error} />
    </li>
  );
}
