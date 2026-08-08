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
 * "Hangi firma adına?" — vekil kullanıcı (plasiyer / süper admin) henüz firma
 * seçmediğinde ekranın yerine bu çıkar. Katalog, tahsilat ve ziyaret üçü de
 * firmasız anlamsız olduğu için seçimi ilk iş yapar.
 *
 * Seçim `basePath?companyId=` bağlantısıyla taşınır: kullanıcı hangi ekrandan
 * geldiyse oraya döner ve firma URL'de görünür kalır (bkz. company-switcher).
 */
export function CompanyPicker({
  basePath,
  eyebrow,
  title = "Firma seçin",
  subtitle,
}: {
  /** Seçilen firmayla dönülecek sayfa, örn. "/rep/tahsilat". */
  basePath: string;
  eyebrow: string;
  title?: string;
  subtitle: string;
}) {
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
        <Building2 className="h-4 w-4 text-primary" />
        <span className="tech-label">{eyebrow}</span>
      </div>
      <h1 className="mb-1 font-display text-xl font-bold">{title}</h1>
      <p className="mb-5 text-sm text-fg-muted">{subtitle}</p>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
        <input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Firma ara…"
          className="h-10 w-full border border-border-strong bg-surface pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
        />
      </div>

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <p className="border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
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
        <ul className="border border-border-strong">
          {companies.map((c, i) => {
            const available = Number(c.availableCredit);
            return (
              <li
                key={c.id}
                className={i > 0 ? "border-t border-border" : ""}
              >
                <Link
                  href={`${basePath}?companyId=${encodeURIComponent(c.id)}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <p className="tech-num mt-0.5 text-[10px] text-fg-muted">
                      {[c.city, c.district].filter(Boolean).join(" / ") || "—"}
                    </p>
                  </div>
                  <div className="tech-num shrink-0 text-right text-[11px]">
                    <p className="text-fg-muted">
                      bakiye {formatTRY(c.currentBalance)}
                    </p>
                    <p
                      className={
                        available < 0
                          ? "font-bold text-danger"
                          : "text-success"
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
