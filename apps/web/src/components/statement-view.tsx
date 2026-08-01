"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { CompanyAging, Statement } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";

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
    return <p className="text-sm text-neutral-500">Yükleniyor…</p>;
  }
  if (statement.isError) {
    return (
      <p className="text-sm text-red-600">{(statement.error as Error).message}</p>
    );
  }

  const s = statement.data!;
  const available = Number(s.company.creditLimit) - Number(s.closingBalance);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Açılış bakiyesi" value={formatTRY(s.openingBalance)} />
        <Card label="Borç" value={formatTRY(s.totalDebit)} />
        <Card label="Alacak" value={formatTRY(s.totalCredit)} />
        <Card
          label="Kapanış bakiyesi"
          value={formatTRY(s.closingBalance)}
          strong
        />
      </section>

      <section className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-neutral-500">
        <span>
          Kredi limiti:{" "}
          <strong className="tabular-nums text-neutral-900 dark:text-neutral-100">
            {formatTRY(s.company.creditLimit)}
          </strong>
        </span>
        <span>
          Kullanılabilir:{" "}
          <strong
            className={`tabular-nums ${available < 0 ? "text-red-600" : "text-emerald-600"}`}
          >
            {formatTRY(available)}
          </strong>
        </span>
        <span>Vade: {s.company.paymentTermDays} gün</span>
      </section>

      {aging.data && (
        <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Yaşlandırma</h2>
            <span className="text-sm">
              Vadesi geçen:{" "}
              <strong
                className={`tabular-nums ${Number(aging.data.overdue) > 0 ? "text-red-600" : ""}`}
              >
                {formatTRY(aging.data.overdue)}
              </strong>
              {aging.data.oldestDueDate && (
                <span className="ml-2 text-neutral-500">
                  en eski vade: {dateOnly(aging.data.oldestDueDate)}
                </span>
              )}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-5">
            {BUCKET_LABELS.map(([key, label]) => {
              const value = aging.data!.buckets[key];
              const overdue = key !== "current" && Number(value) > 0;
              return (
                <div
                  key={key}
                  className={`rounded-md border px-3 py-2 ${
                    overdue
                      ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                      : "border-neutral-200 dark:border-neutral-800"
                  }`}
                >
                  <p className="text-xs text-neutral-500">{label}</p>
                  <p className="tabular-nums">{formatTRY(value)}</p>
                </div>
              );
            })}
          </div>
          {Number(aging.data.unappliedCredit) > 0 && (
            <p className="mt-2 text-xs text-neutral-500">
              Açık borca mahsup edilmemiş tahsilat (avans):{" "}
              {formatTRY(aging.data.unappliedCredit)}
            </p>
          )}
        </section>
      )}

      <section className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-neutral-500">
          Başlangıç
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="ml-2 h-9 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="text-xs text-neutral-500">
          Bitiş
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="ml-2 h-9 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        {(from || to) && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="h-9 rounded-md border border-neutral-300 px-3 text-sm dark:border-neutral-700"
          >
            Temizle
          </button>
        )}
        <button
          type="button"
          onClick={() => downloadCsv(s)}
          disabled={s.rows.length === 0}
          className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white disabled:opacity-50"
        >
          CSV indir
        </button>
      </section>

      <section className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2">Tarih</th>
              <th className="px-3 py-2">Açıklama</th>
              <th className="px-3 py-2">Kaydeden</th>
              <th className="px-3 py-2 text-right">Borç</th>
              <th className="px-3 py-2 text-right">Alacak</th>
              <th className="px-3 py-2 text-right">Bakiye</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            <tr className="bg-neutral-50/60 dark:bg-neutral-900/40">
              <td className="px-3 py-2 text-neutral-500" colSpan={5}>
                Açılış bakiyesi
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatTRY(s.openingBalance)}
              </td>
            </tr>
            {s.rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-3 py-2 text-neutral-500">
                  {dateTime(r.createdAt)}
                </td>
                <td className="px-3 py-2">
                  {r.orderId ? (
                    <Link href={`/orders/${r.orderId}`} className="underline">
                      {r.description}
                    </Link>
                  ) : (
                    r.description
                  )}
                </td>
                <td className="px-3 py-2 text-neutral-500">
                  {r.recordedByName ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.type === "DEBIT" ? formatTRY(r.debit) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-500">
                  {r.type === "CREDIT" ? formatTRY(r.credit) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatTRY(r.balance)}
                </td>
              </tr>
            ))}
            {s.rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-neutral-500" colSpan={6}>
                  Bu aralıkta hareket yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Card({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`tabular-nums ${strong ? "text-lg font-bold" : "text-lg"}`}>
        {value}
      </p>
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
    ["", esc("Toplam"), "", num(s.totalDebit), num(s.totalCredit), num(s.closingBalance)].join(";"),
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
