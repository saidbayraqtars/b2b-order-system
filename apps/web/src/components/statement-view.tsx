"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Download, Hourglass, Printer } from "lucide-react";
import type { CompanyAging, Statement } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import {
  ErrorLine,
  Button,
  Label,
  LinkButton,
  Panel,
  TextInput,
} from "@/components/form";
import {
  LoadingState,
  StatTile,
  TBody,
  THead,
  Table,
  TableEmpty,
  Td,
  Th,
} from "@/components/ui";
import { formatTRY } from "@/lib/format";
import { cn } from "@/lib/utils";

// Cari ekstre for one company. Used by both /portal/statement (the company
// looking at itself) and /admin/companies/:id/statement — the API scopes the
// data, so the same component serves both without a role prop.

const BUCKET_LABELS = [
  ["current", "Vadesi gelmemiş"],
  ["d1_30", "1-30 gün"],
  ["d31_60", "31-60 gün"],
  ["d61_90", "61-90 gün"],
  ["d90_plus", "90+ gün"],
] as const;

function dateTime(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateOnly(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR");
}

export function StatementView({ companyId }: { companyId: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const suffix = qs.toString() ? `?${qs}` : "";

  const statement = useQuery({
    queryKey: ["statement", companyId, from, to],
    queryFn: () =>
      apiGet<Statement>(`/api/companies/${companyId}/statement${suffix}`),
  });

  const aging = useQuery({
    queryKey: ["aging", companyId],
    queryFn: () => apiGet<CompanyAging>(`/api/companies/${companyId}/aging`),
  });

  if (statement.isLoading) {
    return <LoadingState />;
  }
  if (statement.isError) {
    return <ErrorLine error={statement.error} />;
  }

  const s = statement.data!;
  const available = Number(s.company.creditLimit) - Number(s.closingBalance);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Açılış bakiyesi" value={formatTRY(s.openingBalance)} />
        <StatTile label="Borç" value={formatTRY(s.totalDebit)} />
        <StatTile label="Alacak" value={formatTRY(s.totalCredit)} />
        <StatTile
          label="Kapanış bakiyesi"
          value={formatTRY(s.closingBalance)}
          hint={`Vade ${s.company.paymentTermDays} gün`}
        />
      </section>

      <section className="flex flex-wrap items-center gap-x-6 gap-y-1 text-body-sm text-ink-muted">
        <span>
          Kredi limiti:{" "}
          <strong className="tabular-nums text-ink">
            {formatTRY(s.company.creditLimit)}
          </strong>
        </span>
        <span>
          Kullanılabilir:{" "}
          <strong
            className={cn(
              "tabular-nums",
              available < 0 ? "text-critical" : "text-positive",
            )}
          >
            {formatTRY(available)}
          </strong>
        </span>
      </section>

      {aging.data && (
        <Panel
          title="Yaşlandırma"
          icon={<Hourglass className="h-4 w-4" />}
          action={
            <span className="text-body-sm text-ink-muted">
              Vadesi geçen:{" "}
              <strong
                className={cn(
                  "tabular-nums",
                  Number(aging.data.overdue) > 0 ? "text-critical" : "text-ink",
                )}
              >
                {formatTRY(aging.data.overdue)}
              </strong>
              {aging.data.oldestDueDate && (
                <span className="ml-2 text-ink-faint">
                  en eski vade: {dateOnly(aging.data.oldestDueDate)}
                </span>
              )}
            </span>
          }
        >
          <div className="grid gap-2 sm:grid-cols-5">
            {BUCKET_LABELS.map(([key, label]) => {
              const value = aging.data!.buckets[key];
              const overdue = key !== "current" && Number(value) > 0;
              return (
                <div
                  key={key}
                  className={cn(
                    "rounded border px-3 py-2",
                    overdue
                      ? "border-critical/30 bg-critical/10"
                      : "border-line bg-sunken",
                  )}
                >
                  <p className="tech-label">{label}</p>
                  <p
                    className={cn(
                      "mt-0.5 tabular-nums",
                      overdue ? "font-semibold text-critical" : "text-ink",
                    )}
                  >
                    {formatTRY(value)}
                  </p>
                </div>
              );
            })}
          </div>
          {Number(aging.data.unappliedCredit) > 0 && (
            <p className="mt-3 text-xs text-ink-faint">
              Açık borca mahsup edilmemiş tahsilat (avans):{" "}
              {formatTRY(aging.data.unappliedCredit)}
            </p>
          )}
        </Panel>
      )}

      <section className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="statement-from">Başlangıç</Label>
          <TextInput
            id="statement-from"
            size="sm"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-auto"
          />
        </div>
        <div>
          <Label htmlFor="statement-to">Bitiş</Label>
          <TextInput
            id="statement-to"
            size="sm"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-auto"
          />
        </div>
        {(from || to) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Temizle
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => downloadCsv(s)}
          disabled={s.rows.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          CSV indir
        </Button>
        {/*
          PDF, belgenin yazdırma görünümünden alınır: tarayıcının "PDF olarak
          kaydet" adımı her makinede var ve Türkçe karakterlerle sorun çıkarmaz.
          Seçili tarih aralığı bağlantıda taşınır — ekranda görülen ekstre ile
          çıkan kâğıt aynı olmalı.
        */}
        <LinkButton
          href={`/documents/statement/${companyId}${suffix}`}
          target="_blank"
          rel="noreferrer"
        >
          <Printer className="h-3.5 w-3.5" />
          PDF / Yazdır
        </LinkButton>
      </section>

      <section className="overflow-hidden rounded-lg border border-line bg-panel">
        <Table>
          <THead>
            <tr>
              <Th>Tarih</Th>
              <Th>Açıklama</Th>
              <Th>Kaydeden</Th>
              <Th align="right">Borç</Th>
              <Th align="right">Alacak</Th>
              <Th align="right">Bakiye</Th>
            </tr>
          </THead>
          <TBody>
            <tr className="bg-sunken/60">
              <Td muted colSpan={5}>
                Açılış bakiyesi
              </Td>
              <Td align="right" numeric>
                {formatTRY(s.openingBalance)}
              </Td>
            </tr>
            {s.rows.map((r) => (
              <tr key={r.id}>
                <Td muted className="whitespace-nowrap">
                  {dateTime(r.createdAt)}
                </Td>
                <Td>
                  {r.orderId ? (
                    <Link
                      href={`/orders/${r.orderId}`}
                      className="hover:underline"
                    >
                      {r.description}
                    </Link>
                  ) : (
                    r.description
                  )}
                </Td>
                <Td muted>{r.recordedByName ?? "—"}</Td>
                <Td align="right" numeric>
                  {r.type === "DEBIT" ? formatTRY(r.debit) : "—"}
                </Td>
                <Td align="right" numeric className="text-positive">
                  {r.type === "CREDIT" ? formatTRY(r.credit) : "—"}
                </Td>
                <Td align="right" numeric className="font-medium">
                  {formatTRY(r.balance)}
                </Td>
              </tr>
            ))}
            {s.rows.length === 0 && (
              <TableEmpty colSpan={6} label="Bu aralıkta hareket yok." />
            )}
          </TBody>
        </Table>
      </section>
    </div>
  );
}

/**
 * Export the statement as CSV. Semicolon-separated with comma decimals and a
 * UTF-8 BOM — that is what Turkish-locale Excel opens correctly without an
 * import wizard.
 */
function downloadCsv(s: Statement) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const num = (v: string) => v.replace(".", ",");

  const lines = [
    ["Tarih", "Açıklama", "Kaydeden", "Borç", "Alacak", "Bakiye"].join(";"),
    ["", esc("Açılış bakiyesi"), "", "", "", num(s.openingBalance)].join(";"),
    ...s.rows.map((r) =>
      [
        esc(dateTime(r.createdAt)),
        esc(r.description),
        esc(r.recordedByName ?? ""),
        num(r.debit),
        num(r.credit),
        num(r.balance),
      ].join(";"),
    ),
    [
      "",
      esc("Toplam"),
      "",
      num(s.totalDebit),
      num(s.totalCredit),
      num(s.closingBalance),
    ].join(";"),
  ];

  const blob = new Blob(["﻿" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ekstre-${s.company.name.replace(/[^\w]+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
