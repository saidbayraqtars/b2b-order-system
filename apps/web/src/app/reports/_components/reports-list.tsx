"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { REPORT_DATASET_LABELS } from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { LoadingState } from "@/components/ui";
import type { DefinitionSummary } from "./types";

export function ReportsList() {
  const query = useQuery({
    queryKey: ["report-definitions"],
    queryFn: () =>
      apiGet<{ definitions: DefinitionSummary[] }>("/api/reports/definitions"),
  });

  if (query.isLoading) {
    return <LoadingState />;
  }
  if (query.isError) {
    return (
      <p className="text-sm text-red-600">{(query.error as Error).message}</p>
    );
  }

  const definitions = query.data!.definitions;

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
          <tr>
            <th className="px-3 py-2">Rapor</th>
            <th className="px-3 py-2">Veri kümesi</th>
            <th className="px-3 py-2">Sahibi</th>
            <th className="px-3 py-2">Güncelleme</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {definitions.map((d) => (
            <tr key={d.id}>
              <td className="px-3 py-2">
                <Link
                  href={`/reports/${d.id}`}
                  className="font-medium underline"
                >
                  {d.name}
                </Link>
                {d.description && (
                  <p className="text-xs text-neutral-500">{d.description}</p>
                )}
              </td>
              <td className="px-3 py-2 text-neutral-500">
                {REPORT_DATASET_LABELS[d.dataset]}
              </td>
              <td className="px-3 py-2 text-neutral-500">
                {d.isOwn ? "Siz" : d.ownerName}
                {d.isShared && (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    paylaşık
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-neutral-500">
                {new Date(d.updatedAt).toLocaleDateString("tr-TR")}
              </td>
            </tr>
          ))}
          {definitions.length === 0 && (
            <tr>
              <td
                className="px-3 py-6 text-center text-neutral-500"
                colSpan={4}
              >
                Henüz kayıtlı rapor yok. &quot;Yeni rapor&quot; ile başlayın.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
