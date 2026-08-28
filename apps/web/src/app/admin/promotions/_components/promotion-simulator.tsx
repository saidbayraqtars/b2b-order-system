"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import type { PromotionRow, SimulationResult } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { useUrlState } from "@/lib/url-state";
import {
  Button,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";
import {
  Badge,
  LoadingState,
  StatTile,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";

// Kampanya simülatörü — "bu kampanyayı açsaydım geçen ay ne kadar indirim
// verirdim?"
//
// Sonuç adreste (`?kampanya=&baslangic=&bitis=`): kuru koşu bir sorgudur, bir
// işlem değil, ve bir yöneticiye "şuna bak" diye gönderilebilmeli.

/** Süzgeç varsayılanları — modül düzeyinde, `useUrlState` kimlik bekliyor. */
const FILTER_DEFAULTS = { kampanya: "", baslangic: "", bitis: "" };

/** Geçen ayın ilk ve son günü — simülasyonun olağan penceresi. */
function lastMonth(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  return { from: iso(start), to: iso(end) };
}

export function PromotionSimulator() {
  const filters = useUrlState(FILTER_DEFAULTS);
  const fallback = lastMonth();
  const promotionId = filters.value.kampanya;
  const from = filters.value.baslangic || fallback.from;
  const to = filters.value.bitis || fallback.to;

  // Form durumu yerelde; "Çalıştır" adrese yazıyor. Her tarih tuşunda beş bin
  // sipariş okumak, bu ekranı kullanılamaz yapardı.
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  const promotions = useQuery({
    queryKey: ["admin-promotions"],
    queryFn: () =>
      apiGet<{ promotions: PromotionRow[] }>("/api/admin/promotions"),
  });

  const run = useQuery({
    queryKey: ["promotion-simulation", promotionId, from, to],
    queryFn: () =>
      apiGet<{ result: SimulationResult }>(
        `/api/admin/promotions/simulate?id=${promotionId}&from=${from}&to=${to}`,
      ),
    enabled: promotionId !== "",
  });

  const result = run.data?.result;

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Kuru koşu">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="sim-promo">Kampanya</Label>
            <Select
              id="sim-promo"
              value={promotionId}
              onChange={(e) => filters.set({ kampanya: e.target.value })}
              className="w-64"
            >
              <option value="">Seçin…</option>
              {(promotions.data?.promotions ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.enabled ? "" : " (kapalı)"}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="sim-from">Başlangıç</Label>
            <TextInput
              id="sim-from"
              type="date"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="sim-to">Bitiş</Label>
            <TextInput
              id="sim-to"
              type="date"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="w-40"
            />
          </div>
          <Button
            disabled={!promotionId}
            loading={run.isFetching}
            onClick={() =>
              filters.set({ baslangic: draftFrom, bitis: draftTo })
            }
          >
            <FlaskConical className="h-4 w-4" />
            Çalıştır
          </Button>
        </div>
        <p className="mt-3 text-body-sm text-ink-muted">
          Simülasyon <strong>hiçbir şey yazmaz</strong>: sipariş tutarları
          değişmez, kullanım kaydı açılmaz. Kapalı bir kampanya da denenebilir —
          asıl amacı budur.
        </p>
        <ErrorLine error={run.error} />
      </Panel>

      {run.isFetching && !result && (
        <Panel title="Sonuç">
          <LoadingState label="Siparişler yeniden fiyatlanıyor…" />
        </Panel>
      )}

      {result && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Verilecek indirim"
              value={formatTRY(Number(result.totalDiscount))}
              hint={`${result.ordersMatched} siparişte`}
              tone={Number(result.totalDiscount) > 0 ? "caution" : "neutral"}
            />
            {/* Asıl soru bu: cironun yüzde kaçı. Mutlak tutar tek başına
                büyük ya da küçük görünür; oran karar verdirir. */}
            <StatTile
              label="Cironun payı"
              value={`%${result.discountShare}`}
              hint={`${formatTRY(Number(result.totalNetGoods))} net mal bedeli`}
            />
            <StatTile
              label="Kapsanan sipariş"
              value={`${result.ordersMatched} / ${result.ordersConsidered}`}
              hint="aralıktaki gerçekleşmiş siparişler"
            />
            <StatTile
              label="Hediye adedi"
              value={result.giftUnits}
              hint={
                result.blockedByQuota > 0
                  ? `${result.blockedByQuota} sipariş kotaya takıldı`
                  : "bedelsiz verilen kalem"
              }
            />
          </section>

          <Panel
            title={`${result.promotionName} — en çok indirim gören siparişler`}
            bodyClassName="p-0"
            action={
              <Badge tone={result.enabled ? "success" : "neutral"}>
                {result.enabled ? "açık" : "kapalı"}
              </Badge>
            }
          >
            <Table stickyHead>
              <THead>
                <tr>
                  <Th>Sipariş</Th>
                  <Th>Firma</Th>
                  <Th>Tarih</Th>
                  <Th align="right">Net mal bedeli</Th>
                  <Th align="right">İndirim</Th>
                  <Th align="right">Pay</Th>
                </tr>
              </THead>
              <TBody>
                {result.orders.length === 0 && (
                  <TableEmpty
                    colSpan={6}
                    label="Bu kampanya aralıktaki hiçbir siparişe uygulanmazdı."
                  />
                )}
                {result.orders.map((o) => (
                  <tr key={o.orderId}>
                    <Td>
                      <Link
                        href={`/orders/${o.orderId}`}
                        className="font-medium text-ink underline-offset-4 hover:underline"
                      >
                        {o.orderNumber}
                      </Link>
                    </Td>
                    <Td muted>{o.companyName}</Td>
                    <Td muted>
                      {new Date(o.createdAt).toLocaleDateString("tr-TR")}
                    </Td>
                    <Td align="right" numeric muted>
                      {formatTRY(Number(o.netGoods))}
                    </Td>
                    <Td align="right" numeric className="font-medium text-ink">
                      {formatTRY(Number(o.discount))}
                    </Td>
                    <Td align="right" numeric muted>
                      %{o.share}
                    </Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </Panel>
        </>
      )}
    </div>
  );
}
