"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";

interface CompanyRow {
  id: string;
  name: string;
  creditLimit: string;
  currentBalance: string;
  isActive: boolean;
}

export function CompaniesTable() {
  const query = useQuery({
    queryKey: ["companies"],
    queryFn: () => apiGet<{ companies: CompanyRow[] }>("/api/admin/companies"),
  });

  if (query.isLoading) {
    return <p className="text-sm text-neutral-500">Yükleniyor…</p>;
  }
  if (query.isError) {
    return (
      <p className="text-sm text-red-600">{(query.error as Error).message}</p>
    );
  }

  const companies = query.data?.companies ?? [];

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
          <tr>
            <th className="px-3 py-2">Firma</th>
            <th className="px-3 py-2 text-right">Bakiye</th>
            <th className="px-3 py-2 text-right">Limit</th>
            <th className="px-3 py-2 text-right">Kullanılabilir</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {companies.map((c) => {
            const available = Number(c.creditLimit) - Number(c.currentBalance);
            return (
              <tr key={c.id}>
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatTRY(c.currentBalance)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatTRY(c.creditLimit)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    available < 0 ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  {formatTRY(available)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
