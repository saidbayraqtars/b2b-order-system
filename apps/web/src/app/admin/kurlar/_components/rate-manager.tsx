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
  LoadingState,
  StatTile,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import {
  Button,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";

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

/** 24 saati geçmiş bir kur hâlâ satış yapıyor demektir — kutu bunu söyler. */
function isStale(r: CurrentRate): boolean {
  return r.staleHours !== null && r.staleHours >= 24;
}

/** Rakamın altındaki tek satır: birimin adı, kurun yaşı ve varsa eksikliği. */
function hintFor(r: CurrentRate): string {
  if (r.missing) return "kur girilmemiş — bu birimdeki ürünler fiyatlanamıyor";
  const parts = [CURRENCY_LABELS[r.currency]];
  if (r.validFrom) parts.push(trDateTime(r.validFrom));
  if (isStale(r))
    parts.push(`${Math.floor(r.staleHours! / 24)} gün önce girildi`);
  return parts.join(" · ");
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
          <StatTile
            key={r.currency}
            label={r.currency}
            value={r.missing ? "—" : `${r.rate} ₺`}
            tone={r.missing ? "critical" : isStale(r) ? "caution" : "neutral"}
            hint={hintFor(r)}
          />
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
        <p className="mt-3 text-xs text-ink-faint">
          Kur satırı güncellenmez, yenisi eklenir. Geçmiş siparişler kendi
          kurlarını taşıdığı için yeni kur onların tutarını değiştirmez. TCMB
          bülteni ayrıca saatlik bir bakım işiyle otomatik yazılıyor; elle
          girilen kur en son yazıldığı için geçerli olur.
        </p>
      </Panel>

      <Panel title="Kur geçmişi" bodyClassName="p-0">
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
