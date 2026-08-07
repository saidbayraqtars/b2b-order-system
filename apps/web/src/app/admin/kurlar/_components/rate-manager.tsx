"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CURRENCY_LABELS,
  FOREIGN_CURRENCIES,
  type Currency,
} from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { Badge, Card, LoadingState } from "@/components/ui";

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

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Kur gir</h2>
        <form
          className="flex flex-wrap items-end gap-2"
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
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600">Para birimi</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="rounded border border-neutral-300 px-2 py-1.5"
            >
              {FOREIGN_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} — {CURRENCY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600">1 {currency} kaç ₺</span>
            <input
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputMode="decimal"
              placeholder="34,2150"
              className="w-32 rounded border border-neutral-300 px-2 py-1.5 tabular-nums"
            />
          </label>
          <button
            type="submit"
            disabled={save.isPending}
            className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"
          >
            {save.isPending ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </form>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <p className="mt-3 text-xs text-neutral-500">
          Kur satırı güncellenmez, yenisi eklenir. Geçmiş siparişler kendi
          kurlarını taşıdığı için yeni kur onların tutarını değiştirmez.
        </p>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Geçerlilik</th>
                <th className="px-3 py-2">Birim</th>
                <th className="px-3 py-2 text-right">Kur</th>
                <th className="px-3 py-2">Kaynak</th>
                <th className="px-3 py-2">Giren</th>
              </tr>
            </thead>
            <tbody>
              {(data?.history ?? []).map((h) => (
                <tr key={h.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">
                    {trDateTime(h.validFrom)}
                  </td>
                  <td className="px-3 py-2">{h.currency}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{h.rate}</td>
                  <td className="px-3 py-2 text-xs text-neutral-500">{h.source}</td>
                  <td className="px-3 py-2 text-xs text-neutral-500">
                    {h.createdByName ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
