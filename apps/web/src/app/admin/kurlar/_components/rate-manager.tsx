"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CURRENCY_LABELS,
  FOREIGN_CURRENCIES,
  type Currency,
} from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import {
  Badge,
  Card,
  LoadingState,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { Button, ErrorLine, Label, Panel, Select, TextInput } from "@/components/form";

// Kur girişi.
//
// Ekranın ilk işi **eksik kuru göstermek**: kuru girilmemiş bir para birimi,
// o para birimindeki ürünlerin hiç satılamaması demek ve bunun sessizce
// durması kabul edilemez. İkinci işi kurun kaç saat önce girildiğini söylemek —
// üç gün önceki kurla satış yapmak, kur girmemekten daha sinsi bir hata.

interface CurrentRate {
  currency: Currency;
  rate: string | null;
  validFrom: string | null;
  missing: boolean;
  staleHours: number | null;
}

interface HistoryRow {
  id: string;
  currency: string;
  rate: string;
  validFrom: string;
  source: string;
  createdByName: string | null;
}

function trDateTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function RateManager() {
  const qc = useQueryClient();
  const [currency, setCurrency] = useState<Currency>(FOREIGN_CURRENCIES[0]!);
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["exchange-rates"],
    queryFn: () =>
      apiGet<{ current: CurrentRate[]; history: HistoryRow[] }>(
        "/api/exchange-rates",
      ),
  });

  const save = useMutation({
    mutationFn: (input: { currency: Currency; rate: number }) =>
      apiPost("/api/exchange-rates", input),
    onSuccess: () => {
      setRate("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["exchange-rates"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {(data?.current ?? []).map((r) => (
          <Card key={r.currency}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">{r.currency}</span>
              <span className="text-xs text-neutral-500">
                {CURRENCY_LABELS[r.currency]}
              </span>
            </div>
            {r.missing ? (
              <>
                <div className="mt-1 text-xl font-semibold text-red-600">—</div>
                <Badge tone="danger">kur girilmemiş</Badge>
                <p className="mt-1 text-xs text-neutral-500">
                  Bu para birimindeki ürünler fiyatlanamıyor.
                </p>
              </>
            ) : (
              <>
                <div className="mt-1 text-xl font-semibold tabular-nums">
                  {r.rate} ₺
                </div>
                <div className="text-xs text-neutral-500">
                  {r.validFrom ? trDateTime(r.validFrom) : ""}
                </div>
                {r.staleHours !== null && r.staleHours >= 24 ? (
                  <Badge tone="warning">{Math.floor(r.staleHours / 24)} gün önce</Badge>
                ) : null}
              </>
            )}
          </Card>
        ))}
      </div>

      <Panel title="Kur gir">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(rate.replace(",", "."));
            if (!Number.isFinite(value) || value <= 0) {
              setError("Kur sıfırdan büyük bir sayı olmalı");
              return;
            }
            save.mutate({ currency, rate: value });
          }}
        >
          <div>
            <Label htmlFor="rate-currency">Para birimi</Label>
            <Select
              id="rate-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="w-56"
            >
              {FOREIGN_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} — {CURRENCY_LABELS[c]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="rate-value">1 {currency} kaç ₺</Label>
            <TextInput
              id="rate-value"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputMode="decimal"
              placeholder="34,2150"
              className="w-36 tabular-nums"
            />
          </div>
          <Button type="submit" loading={save.isPending}>
            Kaydet
          </Button>
        </form>
        <ErrorLine error={error ? new Error(error) : null} />
        <p className="mt-3 text-xs text-neutral-500">
          Kur satırı güncellenmez, yenisi eklenir. Geçmiş siparişler kendi
          kurlarını taşıdığı için yeni kur onların tutarını değiştirmez. TCMB
          bülteni ayrıca saatlik bir bakım işiyle otomatik yazılıyor; elle
          girilen kur en son yazıldığı için geçerli olur.
        </p>
      </Panel>

      <Panel title="Kur geçmişi">
        <Table>
          <THead>
            <tr>
              <Th>Geçerlilik</Th>
              <Th>Birim</Th>
              <Th align="right">Kur</Th>
              <Th>Kaynak</Th>
              <Th>Giren</Th>
            </tr>
          </THead>
          <TBody>
            {(data?.history ?? []).map((h) => (
              <tr key={h.id}>
                <Td className="whitespace-nowrap">{trDateTime(h.validFrom)}</Td>
                <Td>{h.currency}</Td>
                <Td align="right" numeric>
                  {h.rate}
                </Td>
                <Td muted>{h.source}</Td>
                <Td muted>{h.createdByName ?? "—"}</Td>
              </tr>
            ))}
            {(data?.history ?? []).length === 0 && (
              <TableEmpty colSpan={5} label="Henüz kur girilmemiş." />
            )}
          </TBody>
        </Table>
      </Panel>
    </div>
  );
}
