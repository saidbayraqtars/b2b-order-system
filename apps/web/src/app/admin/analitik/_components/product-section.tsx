"use client";

import Link from "next/link";
import type { ProductSnapshot } from "@repo/services";
import { formatTRY } from "@/lib/format";
import { Panel } from "@/components/form";
import {
  Badge,
  Note,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { ShowMore, useVisibleSlice } from "@/components/show-more";
import { NoValue, SourceTile } from "./shared";

// D. Ürün ve stok: ABC, devir hızı, ölü stok, ciro × marj.

export function ProductSection({ data }: { data: ProductSnapshot }) {
  const deadValue = data.deadStock.reduce((a, d) => a + d.costValue, 0);
  // ABC listesi sunucudan tam geliyor; kesme çizimde. Onbeş satır Pareto'nun
  // A sınıfını zaten kapsıyor, gerisi "daha fazla"nın arkasında.
  const abc = useVisibleSlice(data.abc, 15);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SourceTile
          label="Stok devir hızı"
          value={
            data.turnover ? data.turnover.turnover.toFixed(2) : <NoValue />
          }
          hint={
            data.turnover
              ? "yılda kaç kez döndü"
              : "satılan mal maliyeti ya da stok değeri sıfır"
          }
        />
        <SourceTile
          label="DIO"
          value={
            data.turnover ? (
              `${Math.round(data.turnover.dioDays)} gün`
            ) : (
              <NoValue />
            )
          }
          tone={
            data.turnover && data.turnover.dioDays > 180 ? "caution" : "neutral"
          }
          hint="eldeki mal kaç günde tükeniyor"
        />
        <SourceTile
          label="Ölü stok"
          value={formatTRY(deadValue)}
          tone={deadValue > 0 ? "caution" : "neutral"}
          hint={`${data.deadStock.length} varyant, 90 gündür hareketsiz`}
          href="/admin/stok?bolum=hareketler"
          sourceLabel="Stok hareketleri"
        />
        <SourceTile
          label="Maliyetsiz varyant"
          value={data.variantsWithoutCost}
          tone={data.variantsWithoutCost > 0 ? "caution" : "positive"}
          hint="alış fiyatı boş — marjı ve stok değerini bozar"
          href="/admin/products"
          sourceLabel="Ürün listesi"
        />
      </section>

      {/* ABC açık kalıyor: ekranın konusu bu tablo. Kısalma satır sayısından
          ve yoğun kipten geliyor — otuz satır 1300 pikseldi. */}
      <Panel title="ABC analizi ve marj" bodyClassName="p-0 pb-1">
        <Table stickyHead dense>
          <THead>
            <tr>
              <Th>Ürün</Th>
              <Th>Sınıf</Th>
              <Th align="right">Ciro</Th>
              <Th align="right">Adet</Th>
              <Th align="right">Marj</Th>
              <Th align="right">Kümülatif</Th>
            </tr>
          </THead>
          <TBody>
            {abc.visible.map((p) => (
              <tr key={p.productId}>
                <Td>
                  <Link
                    href={`/admin/products/${p.productId}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {p.productName}
                  </Link>
                </Td>
                <Td>
                  <Badge
                    tone={
                      p.abc === "A"
                        ? "brand"
                        : p.abc === "B"
                          ? "info"
                          : "neutral"
                    }
                  >
                    {p.abc}
                  </Badge>
                </Td>
                <Td align="right" numeric>
                  {formatTRY(p.revenue)}
                </Td>
                <Td align="right" numeric muted>
                  {p.quantity}
                </Td>
                <Td
                  align="right"
                  numeric
                  className={
                    p.marginPct === null
                      ? "text-ink-faint"
                      : p.marginPct < 10
                        ? "font-medium text-critical"
                        : ""
                  }
                >
                  {p.marginPct === null ? "—" : `%${p.marginPct.toFixed(1)}`}
                </Td>
                <Td align="right" numeric muted>
                  %{p.cumulativePct.toFixed(0)}
                </Td>
              </tr>
            ))}
            {data.abc.length === 0 && (
              <TableEmpty colSpan={6} label="Son bir yılda satış yok." />
            )}
          </TBody>
        </Table>
        <div className="px-4">
          <ShowMore
            visible={abc.visible.length}
            total={abc.total}
            hidden={abc.hidden}
            onMore={abc.showMore}
            noun="ürün"
          />
        </div>
        <Note className="mx-4" collapsible defaultOpen={false}>
          <strong>Fiyat kararının doğduğu yer burası.</strong> A sınıfı ama
          marjı düşük satırlar — çok satan ve az kazandıran ürünler — kırmızıyla
          işaretli. Sınıflar ciro Pareto&apos;suna göre: %80&apos;e kadar A,
          %95&apos;e kadar B, gerisi C. Marjı boş olan ürünün alış fiyatı
          girilmemiş demektir; sıfır sayılmıyor, hesaplanmıyor.
        </Note>
      </Panel>

      {/* Ölü stok kapalı: bir kez bakılıp aksiyon alınan liste, her açılışta
          okunan değil. Künye kaç varyant ve ne kadar para olduğunu söylüyor. */}
      <Panel
        title="Ölü stok"
        bodyClassName="p-0 pb-1"
        collapsible
        defaultOpen={false}
        summary={
          data.deadStock.length === 0
            ? "yok"
            : `${data.deadStock.length} varyant · ${formatTRY(deadValue)}`
        }
      >
        <Table dense>
          <THead>
            <tr>
              <Th>Ürün</Th>
              <Th>SKU</Th>
              <Th align="right">Eldeki</Th>
              <Th align="right">Maliyet değeri</Th>
              <Th align="right">Son hareket</Th>
            </tr>
          </THead>
          <TBody>
            {data.deadStock.map((d) => (
              <tr key={d.variantId}>
                <Td>
                  <Link
                    href={`/admin/products/${d.productId}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {d.productName}
                  </Link>
                </Td>
                <Td muted className="font-mono">
                  {d.sku}
                </Td>
                <Td align="right" numeric>
                  {d.stock}
                </Td>
                <Td align="right" numeric>
                  {formatTRY(d.costValue)}
                </Td>
                <Td align="right" numeric muted>
                  {d.lastMovementAt
                    ? new Date(d.lastMovementAt).toLocaleDateString("tr-TR")
                    : "hiç"}
                </Td>
              </tr>
            ))}
            {data.deadStock.length === 0 && (
              <TableEmpty colSpan={5} label="90 gündür hareketsiz stok yok." />
            )}
          </TBody>
        </Table>
      </Panel>
    </div>
  );
}
