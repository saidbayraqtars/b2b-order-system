"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ScanLine, Search, ShoppingCart } from "lucide-react";
import type { CatalogProduct, CategoryNode, PageBlock } from "@repo/services";
import type { Permission, Role } from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { findScannedVariant, isScanOrderable } from "@/lib/barcode";
import { useCart } from "@/store/cart";
import { PortalNav } from "@/components/portal-nav";
import { Announcements } from "@/components/storefront/announcements";
import { ActingAsBar } from "@/components/storefront/acting-as-bar";
import { Button, Checkbox, ErrorLine, Select } from "@/components/form";
import { EmptyState, LoadingState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ShowMore, useVisibleSlice } from "@/components/show-more";
import {
  TreeToggle,
  useCategoryTree,
  type TreeInput,
} from "@/components/category-tree";
import { ProductCard } from "./product-card";
import { CartPanel } from "./cart-panel";
import { CATALOG_RETURN_KEY } from "./catalog-return";

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

/**
 * Sunucudan gelen ağacı ortak ağaç bileşeninin girdisine çevirir.
 *
 * Şekil zaten iç içe; dönüşüm yalnızca `data` alanını dolduruyor. Eskiden
 * burada bir `flatten()` vardı ve kenar çubuğu elli bir düğümü birden
 * basıyordu — kapanır ağaç o listenin yerini aldı.
 */
function toTreeInput(nodes: CategoryNode[]): TreeInput<CategoryNode>[] {
  return nodes.map((n) => ({
    id: n.id,
    name: n.name,
    children: toTreeInput(n.children),
    data: n,
  }));
}

/** Kart künyesindeki kategori adı için düz kimlik→ad eşlemesi. */
function collectNames(
  nodes: CategoryNode[],
  into: Map<string, string>,
): Map<string, string> {
  for (const n of nodes) {
    into.set(n.id, n.name);
    collectNames(n.children, into);
  }
  return into;
}

const SORTS = {
  name: "Ada göre",
  "price-asc": "Fiyat ↑",
  "price-desc": "Fiyat ↓",
  stock: "Stoğa göre",
} as const;
type SortKey = keyof typeof SORTS;

function parseSort(value: string | null): SortKey {
  return value && value in SORTS ? (value as SortKey) : "name";
}

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
 * "Stoğa göre" sırası. Hizmetin stoğu 999.999 diye geliyor (stok tutmuyor,
 * hiç tükenmiyor) ve sıranın en başına oturuyordu; stoğu olmayan bir kalem
 * olarak en sona gidiyor.
 */
function stockRank(p: CatalogProduct): number {
  return p.isService ? -1 : totalStock(p);
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
  codes: Record<string, string> = {},
) {
  const params = new URLSearchParams({ companyId });
  if (categoryId) params.set("categoryId", categoryId);
  if (search.trim()) params.set("search", search.trim());
  // `code3` → `kod3`: adresteki süzgeç anahtarı Türkçe (bkz. custom-code.ts).
  for (const [key, value] of Object.entries(codes)) {
    if (value) params.set(key.replace(/^code/, "kod"), value);
  }
  return {
    queryKey: ["catalog", companyId, categoryId, search, codes] as const,
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

  // Süzgeçler adreste (`?kategori=&ara=&sirala=&stok=1&kod3=`): ürüne girip
  // geri dönen, sayfayı yenileyen ya da bağlantıyı paylaşan aynı listeyi
  // görüyor. Önce bileşen durumundaydı ve detaydan dönüş süzgeci siliyordu.
  // Kategori geçmişe yazılıyor (`push`, geri tuşu önceki kategoriye döner);
  // arama, sıra, stok ve kod yazılmıyor (`replace`).
  const router = useRouter();
  const pathname = usePathname();
  const urlParams = useSearchParams();
  const setUrlParams = (
    changes: Record<string, string | null>,
    mode: "push" | "replace",
  ) => {
    const next = new URLSearchParams(urlParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    if (mode === "push") router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  };

  const categoryId = urlParams.get("kategori");
  const sort = parseSort(urlParams.get("sirala"));
  const inStockOnly = urlParams.get("stok") === "1";
  // Özel kod süzgeçleri: yalnızca yönetimin "katalogda göster" dediği alanlar.
  // Adreste API'nin anahtarıyla (`kod3`), durumda alanın adıyla (`code3`).
  const codeFilters = useMemo(() => {
    const out: Record<string, string> = {};
    urlParams.forEach((value, key) => {
      const m = /^kod(\d+)$/.exec(key);
      if (m && value) out[`code${m[1]}`] = value;
    });
    return out;
  }, [urlParams]);
  const setCategoryId = (id: string | null) =>
    setUrlParams({ kategori: id }, "push");
  const setSort = (next: SortKey) =>
    setUrlParams({ sirala: next === "name" ? null : next }, "replace");
  const setInStockOnly = (on: boolean) =>
    setUrlParams({ stok: on ? "1" : null }, "replace");
  const setCodeFilter = (key: string, value: string) =>
    setUrlParams({ [key.replace(/^code/, "kod")]: value || null }, "replace");

  // Okuyucu 13 haneyi tek seferde yazar. Kutu her tuşta sunucuya gitseydi bir
  // okutma bir istek değil on üç istek olurdu; liste gecikmeli terimi izliyor,
  // Enter ise beklemeden kendi sorgusunu yapıyor. Kutudaki yazı yerelde,
  // yazmak durunca adrese (`ara`) gidiyor.
  const debouncedSearch = urlParams.get("ara") ?? "";
  const [search, setSearch] = useState(debouncedSearch);
  // Geri tuşu adresi değiştirince kutu da izlesin. Yazılanın kırpılmışı
  // adresle aynıysa dokunulmuyor — yoksa duraklayan kullanıcının son
  // boşluğu silinirdi.
  useEffect(() => {
    setSearch((prev) =>
      prev.trim() === debouncedSearch ? prev : debouncedSearch,
    );
  }, [debouncedSearch]);
  const codeFilterOptions = useQuery({
    queryKey: ["catalog-code-filters"],
    queryFn: () =>
      apiGet<{
        filters: Array<{ key: string; label: string; values: string[] }>;
      }>("/api/catalog/code-filters"),
    staleTime: 5 * 60_000,
  });
  const filtered = Boolean(
    debouncedSearch ||
    categoryId ||
    inStockOnly ||
    Object.values(codeFilters).some(Boolean),
  );
  const [scanNotice, setScanNotice] = useState<ScanNotice | null>(null);
  const [scanning, setScanning] = useState(false);
  const { itemCount, add } = useCart(companyId);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (search.trim() === debouncedSearch) return;
    const timer = setTimeout(
      () => setUrlParams({ ara: search.trim() || null }, "replace"),
      250,
    );
    return () => clearTimeout(timer);
    // setUrlParams her çizimde yeni; tetik yazı ve adres.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, debouncedSearch]);

  // Ürün detayındaki "Katalog" bağlantısı buraya, süzgeçleriyle dönsün.
  useEffect(() => {
    try {
      const qs = urlParams.toString();
      window.sessionStorage.setItem(
        CATALOG_RETURN_KEY,
        qs ? `${pathname}?${qs}` : pathname,
      );
    } catch {
      // Gizli sekmede yazılamayabilir; bağlantı süzgeçsiz katalogu açar.
    }
  }, [pathname, urlParams]);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<{ categories: CategoryNode[] }>("/api/categories"),
  });

  // companyId her zaman gönderilir. Vekil kullanıcı için zorunlu (fiyat
  // firmaya göre çözülür); alıcı için zararsız — sunucu kendi firmasıyla
  // eşleşmezse zaten 403 verir.
  const catalogQuery = useQuery(
    catalogQueryOptions(companyId, categoryId, debouncedSearch, codeFilters),
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
      const label = hit.unit
        ? `${hit.product.name} · ${hit.variant.sku} · 1 ${hit.unit.name}`
        : `${hit.product.name} · ${hit.variant.sku}`;
      if (!isScanOrderable(hit.variant, hit.unit)) {
        setScanNotice({
          kind: "warn",
          text:
            (hit.unit ? hit.unit.netUnitPrice : hit.variant.netUnitPrice) ===
            null
              ? `${label}: fiyat tanımsız, sepete eklenmedi`
              : `${label}: yeterli stok yok, sepete eklenmedi`,
        });
        return;
      }
      add(
        {
          variantId: hit.variant.id,
          unitsPerCase: hit.variant.unitsPerCase,
          moqUnits: hit.variant.moqUnits,
          stock: hit.variant.stock,
          quantityScale: hit.variant.quantityScale,
        },
        hit.unit ? { id: hit.unit.id, factor: hit.unit.factor } : null,
      );
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

  const categoryRoots = useMemo(
    () => toTreeInput(categoriesQuery.data?.categories ?? []),
    [categoriesQuery.data],
  );
  const categoryTree = useCategoryTree({
    roots: categoryRoots,
    storageKey: "portal-categories",
  });

  // Kartın görsel üstündeki künyesi kategorinin adı. Ürün yalnızca kimliği
  // taşıdığı için ad burada çözülüyor — katalog isteğine ikinci bir alan
  // eklemek, aynı adı her satırda tekrar indirmek olurdu. Ağacın *görünen*
  // satırlarından değil tamamından toplanıyor: kapalı bir dalın altındaki
  // ürünün kartı da adını göstermeli.
  const categoryNames = useMemo(
    () => collectNames(categoriesQuery.data?.categories ?? [], new Map()),
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
        sorted.sort((a, b) => stockRank(b) - stockRank(a));
        break;
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    }
    return sorted;
  }, [catalogQuery.data, sort, inStockOnly]);

  // Izgara ilk 24 kartla açılıyor — dört sütunda altı sıra, bir ekran dolusu.
  // Sıralama ve süzgeç **bütün** liste üzerinde çalıştığı için "en ucuz önce"
  // hâlâ kataloğun en ucuzunu getiriyor; kesilen yalnızca çizim. 2654 ürünü tek
  // seferde çizen sayfa altmış bin piksele çıkıyordu ve kimse onu kaydırarak
  // okumuyor — arıyor.
  const grid = useVisibleSlice(products, 24);

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
              : // Firma adı üst şeritte yazıyor; burada ikinci kez değil, seçili
                // kategori — ürüne girip dönen nerede olduğunu görsün.
                [
                  `${products.length} ürün`,
                  categoryId ? categoryNames.get(categoryId) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
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
                {(codeFilterOptions.data?.filters ?? []).map((f) => (
                  <Select
                    key={f.key}
                    size="sm"
                    aria-label={f.label}
                    value={codeFilters[f.key] ?? ""}
                    onChange={(e) => setCodeFilter(f.key, e.target.value)}
                    className="w-auto"
                  >
                    <option value="">{f.label}: hepsi</option>
                    {f.values.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </Select>
                ))}
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
              {/* Arama kutusu: elli bir düğümlük bir ağaçta kaydırmanın
                  alternatifi dalları tek tek açmak değil, aramak. */}
              <div className="border-b border-line px-2 py-2">
                <input
                  type="search"
                  value={categoryTree.search}
                  onChange={(e) => categoryTree.setSearch(e.target.value)}
                  placeholder="Kategori ara"
                  aria-label="Kategori ara"
                  className="h-7 w-full rounded border border-line bg-sunken px-2 text-xs text-ink outline-none transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-ink-muted"
                />
              </div>
              <ul className="max-h-[28rem] overflow-y-auto py-1">
                <CategoryItem
                  active={categoryId === null}
                  depth={0}
                  onClick={() => setCategoryId(null)}
                >
                  Tümü
                </CategoryItem>
                {categoryTree.rows.map((row) => (
                  <CategoryItem
                    key={row.id}
                    active={categoryId === row.id}
                    depth={row.depth}
                    onClick={() => setCategoryId(row.id)}
                    toggle={
                      <TreeToggle
                        open={row.open}
                        hasChildren={row.hasChildren}
                        label={row.name}
                        onClick={() => categoryTree.toggle(row.id)}
                      />
                    }
                    count={
                      row.hasChildren && !row.open ? row.descendants : null
                    }
                  >
                    {row.name}
                  </CategoryItem>
                ))}
                {categoryTree.matches === 0 && (
                  <li className="px-3 py-2 text-xs text-ink-faint">
                    Eşleşen kategori yok.
                  </li>
                )}
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
              <EmptyState
                label={
                  filtered
                    ? "Bu süzgeçle ürün bulunamadı."
                    : "Katalogda ürün yok."
                }
                action={
                  filtered ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSearch("");
                        const cleared: Record<string, null> = {
                          ara: null,
                          kategori: null,
                          stok: null,
                        };
                        for (const key of Object.keys(codeFilters))
                          cleared[key.replace(/^code/, "kod")] = null;
                        setUrlParams(cleared, "push");
                      }}
                    >
                      Süzgeci temizle
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className={cn("grid gap-4 sm:grid-cols-2", gridColumns)}>
                  {grid.visible.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      companyId={companyId}
                      categoryName={categoryNames.get(p.categoryId) ?? null}
                    />
                  ))}
                </div>
                <ShowMore
                  visible={grid.visible.length}
                  total={grid.total}
                  hidden={grid.hidden}
                  onMore={grid.showMore}
                  noun="ürün"
                />
              </>
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

/**
 * Kenar çubuğunun tek satırı.
 *
 * Ok, satırın **dışında** ayrı bir düğme: iç içe iki tıklanabilir eleman hem
 * klavyede hem ekran okuyucuda bozuk. Ayrılmasının ikinci faydası da davranış
 * — "Ambalaj"ı açmakla "Ambalaj"a süzmek iki ayrı istek ve kullanıcı çoğu
 * zaman yalnızca birini istiyor.
 */
function CategoryItem({
  active,
  depth,
  onClick,
  children,
  toggle,
  count = null,
}: {
  active: boolean;
  depth: number;
  onClick: () => void;
  children: React.ReactNode;
  toggle?: React.ReactNode;
  count?: number | null;
}) {
  return (
    <li
      className={cn(
        "flex items-center border-l-2 transition-colors",
        active
          ? "border-accent bg-subtle"
          : "border-transparent hover:bg-subtle",
      )}
      style={{ paddingLeft: `${8 + depth * 10}px` }}
    >
      {toggle ?? <span aria-hidden className="inline-block w-5 shrink-0" />}
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "min-w-0 flex-1 truncate py-1.5 pr-2 text-left text-xs transition-colors",
          active ? "font-semibold text-ink" : "text-ink-muted hover:text-ink",
        )}
      >
        {children}
      </button>
      {count != null && (
        <span className="shrink-0 pr-2 text-[10px] tabular-nums text-ink-faint">
          {count}
        </span>
      )}
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
