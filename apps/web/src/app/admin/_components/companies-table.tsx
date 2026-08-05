"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { EmptyState, LoadingState } from "@/components/ui";

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
    return <LoadingState />;
  }
  if (query.isError) {
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        {(query.error as Error).message}
      </p>
    );
  }

  const companies = query.data?.companies ?? [];
  if (companies.length === 0) {
    return <EmptyState label="Firma yok." />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-card dark:border-neutral-800 dark:bg-neutral-900">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
          <tr>
            <th className="px-3 py-2">Firma</th>
            <th className="px-3 py-2 text-right">Bakiye</th>
            <th className="px-3 py-2 text-right">Limit</th>
            <th className="px-3 py-2 text-right">Kullanılabilir</th>
            <th className="px-3 py-2 text-right">Ekstre</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {companies.map((c) => {
            const available = Number(c.creditLimit) - Number(c.currentBalance);
            return (
              <tr key={c.id}>
                <td className="px-3 py-2 font-medium">
                  <Link
                    href={`/admin/companies/${c.id}`}
                    className="hover:underline"
                    title="Firmaya özel iskontolar"
                  >
                    {c.name}
                  </Link>
                </td>
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
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/admin/companies/${c.id}/statement`}
                    className="text-indigo-600 hover:underline"
                  >
                    Ekstre
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
