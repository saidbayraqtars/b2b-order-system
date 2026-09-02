"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import type { AdminCategoryRow, AdminProductRow } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import { useUrlState } from "@/lib/url-state";
import {
  Badge,
  EmptyState,
  LoadingState,
  TBody,
  THead,
  Table,
  Td,
} from "@/components/ui";
import {
  Button,
  ErrorLine,
  LinkButton,
  Select,
  TextInput,
} from "@/components/form";
import { SortableTh, useTableSort } from "@/components/table-sort";
import { ShowMore, useVisibleSlice } from "@/components/show-more";

/** Süzgeç varsayılanları — modül düzeyinde, `useUrlState` kimlik bekliyor. */
const FILTER_DEFAULTS = { ara: "", kategori: "" };

export function ProductsTable() {
  const filters = useUrlState(FILTER_DEFAULTS);
  const query = filters.value.ara;
  const categoryId = filters.value.kategori;

  // Kutuya yazılan metin yerelde: arama zaten Enter'da/düğmeyle işleniyordu,
  // şimdi işlendiği yer adres.
  const [search, setSearch] = useState(query);
  useEffect(() => setSearch(query), [query]);

  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () =>
      apiGet<{ categories: AdminCategoryRow[] }>("/api/admin/categories"),
  });

  const params = new URLSearchParams();
  if (query) params.set("search", query);
  if (categoryId) params.set("categoryId", categoryId);
  const qs = params.toString();

  const products = useQuery({
    queryKey: ["admin", "products", query, categoryId],
    queryFn: () =>
      apiGet<{ products: AdminProductRow[] }>(
        `/api/admin/products${qs ? `?${qs}` : ""}`,
      ),
  });

  // Sunucu ada göre döndürüyor; "stoğu en az olan" ya da "en çok varyantlı"
  // soruları ancak sıralamayla cevaplanıyor. İstemcide, çünkü liste süzgeçten
  // sonra zaten tek istekte geliyor.
  const sort = useTableSort(products.data?.products ?? [], {
    value: (p, key) =>
      key === "category"
        ? p.category.name
        : (p as unknown as Record<string, unknown>)[key],
  });
  // Sunucu 200'de kesiyor; ekran da elli satırda. Liste tam 200 geldiyse
  // gerisi hiç indirilmedi ve bunu söylemek gerekiyor — 2654 ürünlük bir
  // katalogda "200 ürün" yazan bir ekran, kataloğun tamamını gösterdiğini ima
  // eder.
  const rows = sort.rows;
  const page = useVisibleSlice(rows, 20);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          value={search}
          placeholder="Ürün adı, marka veya SKU"
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") filters.set({ ara: search.trim() });
          }}
          className="w-64"
        />
        <Button
          variant="secondary"
          onClick={() => filters.set({ ara: search.trim() })}
        >
          Ara
        </Button>
        <Select
          value={categoryId}
          onChange={(e) => filters.set({ kategori: e.target.value })}
          className="w-52"
        >
          <option value="">Tüm kategoriler</option>
          {(categories.data?.categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {products.isLoading && <LoadingState />}
      <ErrorLine error={products.error} />

      {/* İki ayrı boşluk, iki ayrı sonraki adım: süzgeç boş döndüyse yapılacak
          şey süzgeci temizlemek, katalog gerçekten boşsa ilk ürünü açmak.
          Tek metin ikisini birden anlatamıyordu ve "sağ üstten ekleyebilirsiniz"
          diyerek kullanıcıyı ekranın öbür ucuna yolluyordu. */}
      {products.isSuccess && rows.length === 0 && (
        <EmptyState
          label={
            filters.isFiltered
              ? "Bu süzgeçle ürün bulunamadı."
              : "Katalogda ürün yok."
          }
          action={
            filters.isFiltered ? (
              <Button size="sm" variant="secondary" onClick={filters.clear}>
                Süzgeci temizle
              </Button>
            ) : (
              <LinkButton size="sm" href="/admin/products/new">
                Yeni ürün
              </LinkButton>
            )
          }
        />
      )}

      {rows.length > 0 && (
        <div className="overflow-clip rounded-lg border border-line bg-panel">
          {/* Süzgeç şeridi bilerek katlanmadı. Üç kontrol `Disclosure` eşiğinde
              ama iki bin altı yüz ürünlük bir katalogda arama kutusu ekranın
              *aleti*, dipnotu değil — kapatmak kırk piksel kazanıp her ziyarete
              bir tık ekliyordu. Kısalma satır yüksekliğinden geliyor. */}
          <Table stickyHead dense>
            <THead>
              <tr>
                <SortableTh sort={sort} sortKey="name">
                  Ürün
                </SortableTh>
                <SortableTh sort={sort} sortKey="category">
                  Kategori
                </SortableTh>
                <SortableTh sort={sort} sortKey="vatRate" align="right">
                  KDV
                </SortableTh>
                <SortableTh sort={sort} sortKey="variantCount" align="right">
                  Varyant
                </SortableTh>
                <SortableTh sort={sort} sortKey="totalStock" align="right">
                  Stok
                </SortableTh>
                <SortableTh sort={sort} sortKey="isActive">
                  Durum
                </SortableTh>
              </tr>
            </THead>
            <TBody>
              {page.visible.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.brand && (
                      <span className="ml-2 text-xs text-ink-faint">
                        {p.brand}
                      </span>
                    )}
                  </Td>
                  <Td muted>{p.category.name}</Td>
                  <Td align="right" numeric>
                    %{p.vatRate}
                  </Td>
                  <Td align="right" numeric>
                    <span className="inline-flex items-center gap-1">
                      {p.variantCount}
                      {/* Fiyatsız varyant sipariş edilemez; künye yerine ikon,
                          çünkü bu bir durum değil bir uyarı. */}
                      {p.unpricedVariants > 0 && (
                        <AlertTriangle
                          className="h-3.5 w-3.5 text-caution"
                          aria-label={`${p.unpricedVariants} varyantın fiyatı yok — sipariş edilemez`}
                        />
                      )}
                    </span>
                  </Td>
                  <Td align="right" numeric>
                    {p.totalStock}
                  </Td>
                  <Td>
                    <Badge tone={p.isActive ? "success" : "neutral"}>
                      {p.isActive ? "Aktif" : "Pasif"}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {rows.length > 0 && (
        <ShowMore
          visible={page.visible.length}
          total={page.total}
          hidden={page.hidden}
          onMore={page.showMore}
          noun="ürün"
          serverCapped={rows.length >= 200}
        />
      )}
    </div>
  );
}
