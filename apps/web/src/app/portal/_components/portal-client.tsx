"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ShoppingCart } from "lucide-react";
import type { CatalogProduct, CategoryNode } from "@repo/services";
import type { Role } from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { useCart } from "@/store/cart";
import { PortalNav } from "@/components/portal-nav";
import { LoadingState, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ProductCard } from "./product-card";
import { CartPanel } from "./cart-panel";

interface Props {
  companyId: string;
  companyName: string;
  userName: string;
  role: Role;
}

/** Flatten the category tree to a single ordered list for filter chips. */
function flatten(nodes: CategoryNode[], depth = 0): Array<{ id: string; name: string; depth: number }> {
  return nodes.flatMap((n) => [
    { id: n.id, name: n.name, depth },
    ...flatten(n.children, depth + 1),
  ]);
}

export function PortalClient({ companyId, companyName, userName, role }: Props) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const { itemCount } = useCart(companyId);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<{ categories: CategoryNode[] }>("/api/categories"),
  });

  const catalogQuery = useQuery({
    queryKey: ["catalog", categoryId, search],
    queryFn: () => {
      const p = new URLSearchParams();
      if (categoryId) p.set("categoryId", categoryId);
      if (search.trim()) p.set("search", search.trim());
      const qs = p.toString();
      return apiGet<{ products: CatalogProduct[] }>(
        `/api/catalog${qs ? `?${qs}` : ""}`,
      );
    },
  });

  const categories = useMemo(
    () => flatten(categoriesQuery.data?.categories ?? []),
    [categoriesQuery.data],
  );
  const products = catalogQuery.data?.products ?? [];

  return (
    <div>
      <PortalNav
        role={role}
        companyName={companyName}
        userName={userName}
        current="/portal"
        right={
          <span className="mr-1 flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm shadow-brand-600/25">
            <ShoppingCart className="h-3.5 w-3.5" />
            {itemCount}
          </span>
        }
      />

      <div className="mx-auto max-w-6xl px-4 pb-6">
        <div className="mb-4 flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              placeholder="Ürün ara…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-neutral-300 bg-white pl-9 pr-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 hover:border-neutral-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Chip active={categoryId === null} onClick={() => setCategoryId(null)}>
                Tümü
              </Chip>
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  active={categoryId === c.id}
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.depth > 0 ? "↳ " : ""}
                  {c.name}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section>
            {catalogQuery.isLoading ? (
              <LoadingState />
            ) : catalogQuery.isError ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
                {(catalogQuery.error as Error).message}
              </p>
            ) : products.length === 0 ? (
              <EmptyState label="Ürün bulunamadı." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} companyId={companyId} />
                ))}
              </div>
            )}
          </section>

          <CartPanel companyId={companyId} />
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-brand-600 bg-brand-600 text-white shadow-sm shadow-brand-600/20"
          : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-600",
      )}
    >
      {children}
    </button>
  );
}
