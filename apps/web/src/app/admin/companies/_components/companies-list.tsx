"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { CompanyRow } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { Select, TextInput } from "@/components/form";

export function CompaniesList() {
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const query = useQuery({
    queryKey: ["admin-companies", search, includeInactive],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (includeInactive) qs.set("includeInactive", "1");
      return apiGet<{ companies: CompanyRow[] }>(`/api/admin/companies?${qs}`);
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <TextInput
          value={search}
          placeholder="Firma adı veya vergi no"
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-72"
        />
        <Select
          value={includeInactive ? "1" : "0"}
          onChange={(e) => setIncludeInactive(e.target.value === "1")}
          className="max-w-44"
        >
          <option value="0">Yalnız aktifler</option>
          <option value="1">Pasifler dahil</option>
        </Select>
      </div>

      {query.isLoading && <p className="text-sm text-neutral-500">Yükleniyor…</p>}
      {query.isError && (
        <p className="text-sm text-red-600">{(query.error as Error).message}</p>
      )}

      {query.data && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2">Firma</th>
                <th className="px-3 py-2">Grup</th>
                <th className="px-3 py-2">Plasiyer</th>
                <th className="px-3 py-2 text-right">Bakiye</th>
                <th className="px-3 py-2 text-right">Limit</th>
                <th className="px-3 py-2 text-right">Kullanılabilir</th>
                <th className="px-3 py-2 text-right">Vade</th>
                <th className="px-3 py-2 text-right">Ekstre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {query.data.companies.map((c) => (
                <tr key={c.id} className={c.isActive ? "" : "opacity-60"}>
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/admin/companies/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                    {!c.isActive && (
                      <span className="ml-2 text-xs text-neutral-500">(pasif)</span>
                    )}
                    <p className="text-xs text-neutral-500">
                      {c.counts.orders} sipariş · {c.counts.users} kullanıcı ·{" "}
                      {c.counts.addresses} adres
                    </p>
                  </td>
                  <td className="px-3 py-2 text-neutral-500">
                    {c.customerGroup?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-neutral-500">
                    {c.salesRep?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatTRY(c.currentBalance)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatTRY(c.creditLimit)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      Number(c.availableCredit) < 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {formatTRY(c.availableCredit)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                    {c.paymentTermDays} gün
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/companies/${c.id}/statement`}
                      className="text-indigo-600 hover:underline"
                    >
                      Ekstre
                    </Link>
                  </td>
                </tr>
              ))}
              {query.data.companies.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-neutral-500" colSpan={8}>
                    Firma bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
