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
import {
  Badge,
  EmptyState,
  LoadingState,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
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

      {/* Panel "Kampanyalar" diyordu ve sayfa başlığı da öyle: aynı kelime
          iki kez, üst üste. */}
      <Panel
        title="Tanımlar"
        bodyClassName="p-0"
        action={
          !editing && (
            <Button size="sm" onClick={() => setEditing("new")}>
              Yeni kampanya
            </Button>
          )
        }
      >
        {promotions.isLoading && (
          <div className="px-4">
            <LoadingState />
          </div>
        )}
        {(promotions.error ?? rules.error) ? (
          <div className="px-4 pb-4">
            <ErrorLine error={promotions.error ?? rules.error} />
          </div>
        ) : null}

        {promotions.data && rows.length === 0 ? (
          <EmptyState label="Henüz kampanya yok — kampanya koşul + aksiyon olarak tanımlanır ve fiyatın üzerine uygulanır." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Kampanya</Th>
                <Th>Kural</Th>
                <Th align="right">Öncelik</Th>
                <Th>Süre ve limit</Th>
                <Th align="right">Kullanım</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {rows.map((p) => (
                <PromotionRowItem
                  key={p.id}
                  promotion={p}
                  onEdit={() => setEditing(p.id)}
                  onChanged={invalidate}
                />
              ))}
            </TBody>
          </Table>
        )}
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

  const error = toggle.error ?? remove.error;

  return (
    <>
      <tr>
        <Td>
          <span className="font-medium text-ink">{promotion.name}</span>
          {(promotion.code || !promotion.enabled) && (
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              {promotion.code && <Badge tone="brand">{promotion.code}</Badge>}
              {!promotion.enabled && <Badge tone="neutral">Pasif</Badge>}
            </span>
          )}
        </Td>
        <Td muted>
          {promotion.conditions.length} koşul · {promotion.actions.length}{" "}
          aksiyon
          {promotion.stopFurther ? " · tekil" : ""}
        </Td>
        <Td align="right" numeric>
          {promotion.priority}
        </Td>
        <Td muted>
          {windowLabel}
          {limits.length > 0 && (
            <span className="block">limit: {limits.join(", ")}</span>
          )}
        </Td>
        <Td align="right" numeric>
          {promotion.usedCount} sipariş
          <span className="block text-xs text-ink-faint">
            {formatTRY(Number(promotion.discountGranted))} indirim
          </span>
        </Td>
        <Td align="right">
          <div className="flex justify-end gap-1">
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Düzenle
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={toggle.isPending}
              onClick={() => toggle.mutate()}
            >
              {promotion.enabled ? "Pasife al" : "Aktifleştir"}
            </Button>
            <Button
              variant="dangerQuiet"
              size="sm"
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
        </Td>
      </tr>
      {/* Hata satırın altında, kendi satırında: hücreye konsaydı o sütunu
          bütün tablo boyunca genişletirdi. */}
      {error && (
        <tr>
          <Td colSpan={6} className="pt-0">
            <ErrorLine error={error} />
          </Td>
        </tr>
      )}
    </>
  );
}
