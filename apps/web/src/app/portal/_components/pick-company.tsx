"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import type { CompanyOption } from "@/components/storefront/company-switcher";
import { LoadingState, EmptyState } from "@/components/ui";

/**
 * Plasiyer/admin henüz firma seçmediğinde katalog yerine bu ekran çıkar.
 * Boş bir katalog gösterip "önce firma seç" demek yerine, seçimi ilk iş yapar:
 * fiyat firmaya göre çözüldüğü için firmasız bir katalog zaten anlamsız.
 */
export function PickCompany() {
  const [filter, setFilter] = useState("");

  const query = useQuery({
    queryKey: ["orderable-companies"],
    queryFn: () => apiGet<{ companies: CompanyOption[] }>("/api/companies"),
  });

  const companies = useMemo(() => {
    const all = query.data?.companies ?? [];
    const q = filter.trim().toLocaleLowerCase("tr");
    return q ? all.filter((c) => c.name.toLocaleLowerCase("tr").includes(q)) : all;
  }, [query.data, filter]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-6">
      <div className="mb-1 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-brand-600" />
        <span className="tech-label">Adına sipariş girilecek firma</span>
      </div>
      <h1 className="mb-1 font-display text-xl font-bold">Firma seçin</h1>
      <p className="mb-5 text-sm text-neutral-500">
        Fiyatlar, kampanyalar ve kredi limiti firmaya göre çözülür — katalog
        firma seçilmeden açılamaz.
      </p>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Firma ara…"
          className="h-10 w-full border border-neutral-300 bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <p className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-400">
          {(query.error as Error).message}
        </p>
      ) : companies.length === 0 ? (
        <EmptyState
          label={
            filter
              ? "Firma bulunamadı."
              : "Portföyünüzde firma yok. Yöneticinizle görüşün."
          }
        />
      ) : (
        <ul className="border border-neutral-300 dark:border-neutral-700">
          {companies.map((c, i) => {
            const available = Number(c.availableCredit);
            return (
              <li
                key={c.id}
                className={i > 0 ? "border-t border-neutral-200 dark:border-neutral-800" : ""}
              >
                <Link
                  href={`/portal?companyId=${encodeURIComponent(c.id)}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <p className="tech-num mt-0.5 text-[10px] text-neutral-500">
                      {[c.city, c.district].filter(Boolean).join(" / ") || "—"}
                    </p>
                  </div>
                  <div className="tech-num shrink-0 text-right text-[11px]">
                    <p className="text-neutral-500">
                      bakiye {formatTRY(c.currentBalance)}
                    </p>
                    <p
                      className={
                        available < 0
                          ? "font-bold text-red-600 dark:text-red-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }
                    >
                      limit {formatTRY(c.availableCredit)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
