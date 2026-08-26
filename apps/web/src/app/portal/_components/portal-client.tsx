"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanLine, Search, ShoppingCart } from "lucide-react";
import type { CatalogProduct, CategoryNode, PageBlock } from "@repo/services";
import type { Permission, Role } from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { findScannedVariant, isScanOrderable } from "@/lib/barcode";
import { useCart } from "@/store/cart";
import { PortalNav } from "@/components/portal-nav";
import { Announcements } from "@/components/storefront/announcements";
import { ActingAsBar } from "@/components/storefront/acting-as-bar";
import { Checkbox, ErrorLine, Select } from "@/components/form";
import { EmptyState, LoadingState, PageHeader } from "@/components/ui";
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

/**
 * Katalog isteği tek yerde: hem ekrandaki liste hem de barkod okutması aynı
 * anahtarı kullansın. Ayrı yazılsalardı okutma, listenin az önce çektiği aynı
 * cevabı ikinci kez indirirdi.
 */
function catalogQueryOptions(
  companyId: string,
  categoryId: string | null,
  search: string,
) {
  const params = new URLSearchParams({ companyId });
  if (categoryId) params.set("categoryId", categoryId);
  if (search.trim()) params.set("search", search.trim());
  return {
    queryKey: ["catalog", companyId, categoryId, search] as const,
    queryFn: () =>
      apiGet<{ products: CatalogProduct[] }>(`/api/catalog?${params}`),
  };
}

/** Okutma sonucu: kutunun altında tek satır. */
interface ScanNotice {
  kind: "ok" | "warn";
  text: string;
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
  // Sabit `lg:grid-cols-[180px_1fr_320px]` bırakılsaydı kapatılan kenar çubuğu
  // yerinde bir boşluk olarak durur ve "kapanmadı" gibi görünürdü.
  const rowTemplate = showSidebar
    ? showCart
      ? "lg:grid-cols-[200px_1fr_320px]"
      : "lg:grid-cols-[200px_1fr]"
    : showCart
      ? "lg:grid-cols-[1fr_320px]"
      : "lg:grid-cols-1";

  const gridColumns =
    { 2: "xl:grid-cols-2", 3: "xl:grid-cols-3", 4: "xl:grid-cols-4" }[
      Number(on.get("PRODUCT_GRID")?.params.columns) || 3
    ] ?? "xl:grid-cols-3";

  const [search, setSearch] = useState("");
  // Okuyucu 13 haneyi tek seferde yazar. Kutu her tuşta sunucuya gitseydi bir
  // okutma bir istek değil on üç istek olurdu; liste gecikmeli terimi izliyor,
  // Enter ise beklemeden kendi sorgusunu yapıyor.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("name");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [scanNotice, setScanNotice] = useState<ScanNotice | null>(null);
  const [scanning, setScanning] = useState(false);
  const { itemCount, add } = useCart(companyId);
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<{ categories: CategoryNode[] }>("/api/categories"),
  });

  // companyId her zaman gönderilir. Vekil kullanıcı için zorunlu (fiyat
  // firmaya göre çözülür); alıcı için zararsız — sunucu kendi firmasıyla
  // eşleşmezse zaten 403 verir.
  const catalogQuery = useQuery(
    catalogQueryOptions(companyId, categoryId, debouncedSearch),
  );

  /**
   * Arama kutusunda Enter: önce tam eşleşme aranır, bulunursa doğrudan sepete.
   *
   * Kategori bilerek `null` gönderiliyor — okutulan ürün seçili kategorinin
   * dışındaysa da bulunmalı; okuyucuyu tutan kişi ekranda hangi kategorinin
   * seçili olduğunu düşünmek zorunda kalmasın.
   */
  const handleScan = useCallback(async () => {
    const term = search.trim();
    if (!term || scanning) return;
    setScanning(true);
    try {
      const data = await queryClient.fetchQuery(
        catalogQueryOptions(companyId, null, term),
      );
      const hit = findScannedVariant(data.products, term);
      if (!hit) {
        setScanNotice({ kind: "warn", text: `${term}: tam eşleşme yok` });
        return;
      }
      const label = `${hit.product.name} · ${hit.variant.sku}`;
      if (!isScanOrderable(hit.variant)) {
        setScanNotice({
          kind: "warn",
          text:
            hit.variant.netUnitPrice === null
              ? `${label}: fiyat tanımsız, sepete eklenmedi`
              : `${label}: yeterli stok yok, sepete eklenmedi`,
        });
        return;
      }
      add({
        variantId: hit.variant.id,
        unitsPerCase: hit.variant.unitsPerCase,
        moqUnits: hit.variant.moqUnits,
        stock: hit.variant.stock,
      });
      // Kutu temizleniyor ki sıradaki kod üstüne yazılmadan okutulabilsin.
      setSearch("");
      setScanNotice({ kind: "ok", text: `${label} sepete eklendi` });
    } catch (err) {
      setScanNotice({ kind: "warn", text: (err as Error).message });
    } finally {
      setScanning(false);
    }
  }, [add, companyId, queryClient, scanning, search]);

  // Bildirim kendiliğinden söner; art arda okutmada ekranda birikmesin.
  useEffect(() => {
    if (!scanNotice) return;
    const timer = setTimeout(() => setScanNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [scanNotice]);

  const categories = useMemo(
    () => flatten(categoriesQuery.data?.categories ?? []),
    [categoriesQuery.data],
  );

  // Kartın görsel üstündeki künyesi kategorinin adı. Ürün yalnızca kimliği
  // taşıdığı için ad burada çözülüyor — katalog isteğine ikinci bir alan
  // eklemek, aynı adı her satırda tekrar indirmek olurdu.
  const categoryNames = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
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
    <PortalNav
      role={role}
      permissions={permissions}
      companyName={companyName}
      userName={userName}
      isProxy={isProxy}
      companyId={companyId}
      // Arama üst şeritte: katalog ekranının en çok kullanılan kontrolü, sayfa
      // kaydırıldığında da yerinde kalmalı. Sepet sayacıyla aynı hizada durması
      // da tesadüf değil — okutulan ürün soldaki kutudan sağdaki sayaca gidiyor.
      search={
        showSearch ? (
          <CatalogSearch
            value={search}
            onChange={setSearch}
            onScan={handleScan}
            scanning={scanning}
            notice={scanNotice}
          />
        ) : undefined
      }
      right={
        <span className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-semibold tabular-nums text-on-accent">
          <ShoppingCart className="h-3.5 w-3.5" />
          {itemCount}
        </span>
      }
    >
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

      <div className="mx-auto max-w-7xl">
        <PageHeader
          title="Ürün Kataloğu"
          subtitle={
            catalogQuery.isLoading
              ? "Yükleniyor…"
              : `${companyName} için ${products.length} ürün listeleniyor`
          }
          actions={
            showSearch ? (
              <>
                {showStockFilter && (
                  <Checkbox
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                    label="Yalnızca stokta"
                  />
                )}
                <Select
                  size="sm"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  aria-label="Sıralama"
                  className="w-auto"
                >
                  {Object.entries(SORTS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </Select>
              </>
            ) : undefined
          }
        />

        <div className={cn("grid gap-6", rowTemplate)}>
          {/* Kategori kenar çubuğu */}
          {showSidebar && (
            <aside className="h-fit overflow-hidden rounded-lg border border-line bg-panel">
              <p className="tech-label border-b border-line bg-sunken px-3 py-2">
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
            {catalogQuery.isLoading ? (
              <LoadingState />
            ) : catalogQuery.isError ? (
              <ErrorLine error={catalogQuery.error} />
            ) : products.length === 0 ? (
              <EmptyState label="Ürün bulunamadı." />
            ) : (
              <div className={cn("grid gap-4 sm:grid-cols-2", gridColumns)}>
                {products.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    companyId={companyId}
                    categoryName={categoryNames.get(p.categoryId) ?? null}
                  />
                ))}
              </div>
            )}
          </section>

          {showCart && <CartPanel companyId={companyId} />}
        </div>
      </div>
    </PortalNav>
  );
}

/**
 * Üst şeritteki arama kutusu.
 *
 * Okutma bildirimi kutunun altına, akışın dışına konumlanıyor: şerit 64 piksel
 * sabit yükseklikte ve bildirimin satır açması başlığı da sepet sayacını da
 * yerinden oynatırdı.
 */
function CatalogSearch({
  value,
  onChange,
  onScan,
  scanning,
  notice,
}: {
  value: string;
  onChange: (next: string) => void;
  onScan: () => void | Promise<void>;
  scanning: boolean;
  notice: ScanNotice | null;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      <input
        type="search"
        placeholder="Ürün kodu, adı veya barkod ara…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Barkod okuyucu kodun sonuna Enter basar. Kutu bir formun içinde
          // değil, yine de varsayılan engelleniyor: tarayıcı type="search"
          // alanında Enter'ı kendi arama davranışına bağlayabiliyor.
          if (e.key !== "Enter") return;
          e.preventDefault();
          void onScan();
        }}
        aria-describedby={notice ? "scan-notice" : undefined}
        className="h-9 w-full rounded border border-line bg-sunken pl-9 pr-9 text-body-sm text-ink outline-none transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-ink-muted"
      />
      <ScanLine
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors",
          scanning ? "text-ink" : "text-ink-faint/60",
        )}
      />
      {notice && (
        <p
          id="scan-notice"
          role="status"
          className={cn(
            "absolute inset-x-0 top-full z-10 mt-1 truncate rounded border bg-panel px-3 py-1.5 text-xs shadow-pop",
            notice.kind === "ok"
              ? "border-positive/40 text-positive"
              : "border-caution/40 text-caution",
          )}
        >
          {notice.text}
        </p>
      )}
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
          "block w-full truncate border-l-2 py-1.5 pr-3 text-left text-xs transition-colors",
          active
            ? "border-accent bg-subtle font-semibold text-ink"
            : "border-transparent text-ink-muted hover:bg-subtle hover:text-ink",
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
    <div className="mx-auto mb-4 max-w-7xl">
      <div className="rounded-lg border border-line bg-panel px-4 py-3">
        {title.trim() && <p className="tech-label mb-1">{title}</p>}
        {body.trim() && (
          <p className="whitespace-pre-line text-body-sm text-ink-muted">
            {body}
          </p>
        )}
      </div>
    </div>
  );
}
