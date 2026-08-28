"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import type { CompanyOption } from "@/components/storefront/company-switcher";
import { LoadingState, EmptyState } from "@/components/ui";
import { Button, ErrorLine } from "@/components/form";

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
    return q
      ? all.filter((c) => c.name.toLocaleLowerCase("tr").includes(q))
      : all;
  }, [query.data, filter]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-ink-faint" />
        <span className="tech-label">{eyebrow}</span>
      </div>
      <h1 className="mb-1 text-headline-md text-ink">{title}</h1>
      <p className="mb-5 text-body-sm text-ink-muted">{subtitle}</p>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Firma ara…"
          className="h-10 w-full rounded border border-line bg-panel pl-9 pr-3 text-body-sm text-ink outline-none transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-ink-muted"
        />
      </div>

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorLine error={query.error} />
      ) : companies.length === 0 ? (
        <EmptyState
          label={
            filter
              ? "Firma bulunamadı."
              : "Portföyünüzde firma yok. Yöneticinizle görüşün."
          }
          action={
            filter ? (
              <Button size="sm" variant="secondary" onClick={() => setFilter("")}>
                Aramayı temizle
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line bg-panel">
          {companies.map((c, i) => {
            const available = Number(c.availableCredit);
            return (
              <li key={c.id} className={i > 0 ? "border-t border-line" : ""}>
                <Link
                  href={`${basePath}?companyId=${encodeURIComponent(c.id)}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-subtle"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-semibold text-ink">
                      {c.name}
                    </p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-ink-faint">
                      {[c.city, c.district].filter(Boolean).join(" / ") || "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-[11px] tabular-nums">
                    <p className="text-ink-faint">
                      bakiye {formatTRY(c.currentBalance)}
                    </p>
                    <p
                      className={
                        available < 0
                          ? "font-bold text-critical"
                          : "text-positive"
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
