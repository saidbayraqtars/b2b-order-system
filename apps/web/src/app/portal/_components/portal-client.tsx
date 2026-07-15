"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import type { CatalogProduct, CategoryNode } from "@repo/services";
import type { Role } from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { useCart, cartTotals } from "@/store/cart";
import { formatTRY } from "@/lib/format";
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
  const itemCount = useCart((s) => cartTotals(s.lines).itemCount);

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
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{companyName}</h1>
          <p className="text-sm text-neutral-500">{userName} · Katalog</p>
        </div>
        <div className="flex items-center gap-3">
          {role === "COMPANY_ADMIN" && (
            <Link href="/portal/approvals" className="text-sm underline">
              Onaylar
            </Link>
          )}
          <span className="rounded-full bg-neutral-900 px-3 py-1 text-sm text-white dark:bg-white dark:text-neutral-900">
            Sepet: {itemCount}
          </span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          >
            Çıkış
          </button>
        </div>
      </header>

      <div className="mb-4 flex flex-col gap-3">
        <input
          type="search"
          placeholder="Ürün ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
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
            <p className="text-sm text-neutral-500">Yükleniyor…</p>
          ) : catalogQuery.isError ? (
            <p className="text-sm text-red-600">
              {(catalogQuery.error as Error).message}
            </p>
          ) : products.length === 0 ? (
            <p className="text-sm text-neutral-500">Ürün bulunamadı.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </section>

        <CartPanel companyId={companyId} />
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
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
          : "border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}
