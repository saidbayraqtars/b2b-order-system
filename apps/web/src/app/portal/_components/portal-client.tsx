"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ShoppingCart, SlidersHorizontal } from "lucide-react";
import type { CatalogProduct, CategoryNode, PageBlock } from "@repo/services";
import type { Permission, Role } from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { useCart } from "@/store/cart";
import { PortalNav } from "@/components/portal-nav";
import { Announcements } from "@/components/storefront/announcements";
import { ActingAsBar } from "@/components/storefront/acting-as-bar";
import { Checkbox } from "@/components/form";
import { LoadingState, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ProductCard } from "./product-card";
import { CartPanel } from "./cart-panel";

interface Props {
  companyId: string;
  companyName: string;
  userName: string;
  role: Role;
  permissions: readonly Permission[];
  /** Plasiyer / süper admin müşteri adına mı çalışıyor? */
  isProxy?: boolean;
  availableCredit?: string | null;
  /**
   * Sayfa düzeni: hangi blok, hangi sırayla. Sunucudan geliyor ve kayıt
   * defterinden geçmiş — burada tanınmayan tip zaten elenmiş oluyor.
   */
  blocks: readonly PageBlock[];
}

/** Flatten the category tree to a single ordered list for the sidebar. */
function flatten(
  nodes: CategoryNode[],
  depth = 0,
): Array<{ id: string; name: string; depth: number }> {
  return nodes.flatMap((n) => [
    { id: n.id, name: n.name, depth },
    ...flatten(n.children, depth + 1),
  ]);
}

const SORTS = {
  name: "Ada göre",
  "price-asc": "Fiyat ↑",
  "price-desc": "Fiyat ↓",
  stock: "Stoğa göre",
} as const;
type SortKey = keyof typeof SORTS;

/** Kartta gösterilen fiyat gibi: en düşük satılabilir birim fiyat. */
function minPrice(p: CatalogProduct): number {
  const prices = p.variants
    .map((v) => v.netUnitPrice)
    .filter((x): x is string => x !== null)
    .map(Number)
    .filter(Number.isFinite);
  return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
}

function totalStock(p: CatalogProduct): number {
  return p.variants.reduce((s, v) => s + v.stock, 0);
}

export function PortalClient({
  companyId,
  companyName,
  userName,
  role,
  permissions,
  isProxy = false,
  availableCredit = null,
  blocks,
}: Props) {
  // Düzenden okunan kararlar. Kapalı blok listede durur ama çizilmez, bu yüzden
  // her sorunun cevabı "açık mı" — "var mı" değil.
  const on = useMemo(() => {
    const map = new Map<string, PageBlock>();
    for (const b of blocks) if (b.enabled) map.set(b.type, b);
    return map;
  }, [blocks]);

  const stack = blocks.filter(
    (b) => b.enabled && (b.type === "ANNOUNCEMENTS" || b.type === "RICH_TEXT"),
  );
  const searchBlock = on.get("SEARCH_BAR");
  const showSearch = Boolean(searchBlock);
  const showStockFilter = searchBlock?.params.showStockFilter !== false;
  const showSidebar = on.has("CATEGORY_SIDEBAR");
  const showCart = on.has("CART_PANEL");

  // Üç sütunlu satır: kapatılan sütun yer kaplamıyor, kalanlar genişliyor.
  // Sabit `lg:grid-cols-[180px_1fr_300px]` bırakılsaydı kapatılan kenar çubuğu
  // yerinde bir boşluk olarak durur ve "kapanmadı" gibi görünürdü.
  const rowTemplate = showSidebar
    ? showCart
      ? "lg:grid-cols-[180px_1fr_300px]"
      : "lg:grid-cols-[180px_1fr]"
    : showCart
      ? "lg:grid-cols-[1fr_300px]"
      : "lg:grid-cols-1";

  const gridColumns =
    { 2: "xl:grid-cols-2", 3: "xl:grid-cols-3", 4: "xl:grid-cols-4" }[
      Number(on.get("PRODUCT_GRID")?.params.columns) || 3
    ] ?? "xl:grid-cols-3";

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("name");
  const [inStockOnly, setInStockOnly] = useState(false);
  const { itemCount } = useCart(companyId);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<{ categories: CategoryNode[] }>("/api/categories"),
  });

  const catalogQuery = useQuery({
    queryKey: ["catalog", companyId, categoryId, search],
    queryFn: () => {
      // companyId her zaman gönderilir. Vekil kullanıcı için zorunlu (fiyat
      // firmaya göre çözülür); alıcı için zararsız — sunucu kendi firmasıyla
      // eşleşmezse zaten 403 verir.
      const p = new URLSearchParams({ companyId });
      if (categoryId) p.set("categoryId", categoryId);
      if (search.trim()) p.set("search", search.trim());
      return apiGet<{ products: CatalogProduct[] }>(`/api/catalog?${p}`);
    },
  });

  const categories = useMemo(
    () => flatten(categoriesQuery.data?.categories ?? []),
    [categoriesQuery.data],
  );

  // Sıralama ve stok filtresi istemcide: katalog zaten tek istekte geliyor,
  // her sıralama değişiminde sunucuya gitmek gereksiz gecikme olurdu.
  const products = useMemo(() => {
    let list = catalogQuery.data?.products ?? [];
    if (inStockOnly) list = list.filter((p) => totalStock(p) > 0);
    const sorted = [...list];
    switch (sort) {
      case "price-asc":
        sorted.sort((a, b) => minPrice(a) - minPrice(b));
        break;
      case "price-desc":
        sorted.sort((a, b) => minPrice(b) - minPrice(a));
        break;
      case "stock":
        sorted.sort((a, b) => totalStock(b) - totalStock(a));
        break;
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    }
    return sorted;
  }, [catalogQuery.data, sort, inStockOnly]);

  return (
    <div className="min-h-screen tech-paper">
      <PortalNav
        role={role}
        permissions={permissions}
        companyName={companyName}
        userName={userName}
        current="/portal"
        isProxy={isProxy}
        companyId={companyId}
        right={
          <span className="mr-1 flex items-center gap-1.5 bg-brand-600 px-3 py-1.5 font-mono text-xs font-bold text-white">
            <ShoppingCart className="h-3.5 w-3.5" />
            {itemCount}
          </span>
        }
      />

      {isProxy && (
        <ActingAsBar
          companyName={companyName}
          availableCredit={availableCredit}
        />
      )}

      {/* Duyurular ve serbest metin: tam genişlikte, kayıttaki sırayla. */}
      {stack.map((b) =>
        b.type === "ANNOUNCEMENTS" ? (
          <Announcements key={b.type} companyId={companyId} />
        ) : b.type === "RICH_TEXT" ? (
          <RichText
            key={b.type}
            title={String(b.params.title ?? "")}
            body={String(b.params.body ?? "")}
          />
        ) : null,
      )}

      <div className="mx-auto max-w-6xl px-4 pb-10">
        {/* Arama + sıralama şeridi */}
        {showSearch && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="search"
                placeholder="Ürün adı, marka, SKU veya barkod…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full border border-neutral-300 bg-white pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-neutral-400 hover:border-neutral-400 focus:border-brand-500 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>

            {showStockFilter && (
              <Checkbox
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                label={<span className="tech-label">stokta</span>}
              />
            )}

            <div className="flex h-10 items-center gap-2 border border-neutral-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900">
              <SlidersHorizontal className="h-3.5 w-3.5 text-neutral-400" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sıralama"
                className="bg-transparent font-mono text-[11px] uppercase tracking-wider outline-none"
              >
                {Object.entries(SORTS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className={cn("grid gap-6", rowTemplate)}>
          {/* Kategori kenar çubuğu */}
          {showSidebar && (
            <aside className="h-fit border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900">
              <p className="tech-label border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
                Kategoriler
              </p>
              <ul className="max-h-[28rem] overflow-y-auto py-1">
                <CategoryItem
                  active={categoryId === null}
                  depth={0}
                  onClick={() => setCategoryId(null)}
                >
                  Tümü
                </CategoryItem>
                {categories.map((c) => (
                  <CategoryItem
                    key={c.id}
                    active={categoryId === c.id}
                    depth={c.depth}
                    onClick={() => setCategoryId(c.id)}
                  >
                    {c.name}
                  </CategoryItem>
                ))}
              </ul>
            </aside>
          )}

          {/* Ürün ızgarası */}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="tech-label">
                {catalogQuery.isLoading
                  ? "yükleniyor"
                  : `${products.length} ürün`}
              </span>
            </div>

            {catalogQuery.isLoading ? (
              <LoadingState />
            ) : catalogQuery.isError ? (
              <p className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-400">
                {(catalogQuery.error as Error).message}
              </p>
            ) : products.length === 0 ? (
              <EmptyState label="Ürün bulunamadı." />
            ) : (
              <div className={cn("grid gap-3 sm:grid-cols-2", gridColumns)}>
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} companyId={companyId} />
                ))}
              </div>
            )}
          </section>

          {showCart && <CartPanel companyId={companyId} />}
        </div>
      </div>
    </div>
  );
}

function CategoryItem({
  active,
  depth,
  onClick,
  children,
}: {
  active: boolean;
  depth: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        style={{ paddingLeft: `${12 + depth * 10}px` }}
        className={cn(
          "block w-full truncate py-1.5 pr-3 text-left text-xs transition-colors",
          active
            ? "border-l-2 border-brand-600 bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
            : "border-l-2 border-transparent text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
        )}
      >
        {children}
      </button>
    </li>
  );
}

/**
 * Kalıcı vitrin metni.
 *
 * Duyurudan (Announcement) ayrı: onun tarihi, hedef grubu ve kapatılabilirliği
 * var — bu ise sayfanın bir parçası. İkisini tek modelde toplamak, bir metin
 * düzeltmesini kampanya hedeflemesine yazma hâline getirirdi.
 */
function RichText({ title, body }: { title: string; body: string }) {
  if (!title.trim() && !body.trim()) return null;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <div className="border border-neutral-300 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
        {title.trim() && <p className="tech-label mb-1">{title}</p>}
        {body.trim() && (
          <p className="whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300">
            {body}
          </p>
        )}
      </div>
    </div>
  );
}
