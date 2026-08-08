"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown, Search } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { cn } from "@/lib/utils";

// Plasiyer / süper admin "hangi firma adına" çalıştığını buradan seçer.
//
// Seçim URL'de (?companyId=) taşınır, tarayıcı hafızasında değil. Sebebi:
// yanlış cariye sipariş girmek pahalı bir hatadır ve gizli bir durumdan
// beslenmemeli. URL'de olunca adres çubuğunda görünür, yenilemede korunur,
// sekmeler birbirinden bağımsız kalır ve sunucu her istekte aynı değeri
// resolveCompanyId'ye verip yetkilendirir.

export interface CompanyOption {
  id: string;
  name: string;
  creditLimit: string;
  currentBalance: string;
  availableCredit: string;
  city: string | null;
  district: string | null;
}

export function CompanySwitcher({
  currentCompanyId,
  currentCompanyName,
  basePath = "/portal",
}: {
  currentCompanyId: string | null;
  currentCompanyName: string | null;
  /**
   * Firma değişince gidilecek sayfa. Varsayılan katalog, ama tahsilat ve
   * ziyaret ekranları da aynı seçiciyi kullanıyor: orada firma değiştiren
   * kullanıcı katalogda değil, bulunduğu işin ekranında kalmalı.
   */
  basePath?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const query = useQuery({
    queryKey: ["orderable-companies"],
    queryFn: () => apiGet<{ companies: CompanyOption[] }>("/api/companies"),
    staleTime: 60_000,
  });

  const companies = useMemo(() => {
    const all = query.data?.companies ?? [];
    const q = filter.trim().toLocaleLowerCase("tr");
    return q
      ? all.filter((c) => c.name.toLocaleLowerCase("tr").includes(q))
      : all;
  }, [query.data, filter]);

  function pick(id: string) {
    setOpen(false);
    setFilter("");
    router.push(`${basePath}?companyId=${encodeURIComponent(id)}`);
    // Katalog, sepet ve duyurular firmaya göre değişir; sunucu bileşenleri de
    // yeni firmayla yeniden çalışsın.
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-9 items-center gap-2 border px-3 transition-colors",
          currentCompanyId
            ? "border-border-strong bg-surface hover:border-primary"
            : "border-warning bg-warning-soft text-warning",
        )}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-[12rem] truncate font-mono text-[11px] font-medium uppercase tracking-wider">
          {currentCompanyName ?? "Firma seçin"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>

      {open && (
        <>
          {/* Dışarı tıklayınca kapansın. */}
          <button
            type="button"
            aria-label="Kapat"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            className="absolute right-0 z-50 mt-1 w-80 animate-fade-in border border-border-strong bg-surface shadow-card-hover"
          >
            <div className="relative border-b border-border">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
              <input
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Firma ara…"
                className="h-9 w-full bg-transparent pl-9 pr-3 text-xs outline-none"
              />
            </div>

            <ul className="max-h-80 overflow-y-auto">
              {query.isLoading && (
                <li className="px-3 py-3 text-xs text-fg-muted">Yükleniyor…</li>
              )}
              {!query.isLoading && companies.length === 0 && (
                <li className="px-3 py-3 text-xs text-fg-muted">
                  Firma bulunamadı.
                </li>
              )}
              {companies.map((c) => {
                const available = Number(c.availableCredit);
                const active = c.id === currentCompanyId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => pick(c.id)}
                      className={cn(
                        "flex w-full flex-col gap-0.5 border-l-2 px-3 py-2 text-left transition-colors",
                        active
                          ? "border-primary bg-primary-soft"
                          : "border-transparent hover:bg-surface3",
                      )}
                    >
                      <span className="truncate text-xs font-semibold">
                        {c.name}
                      </span>
                      <span className="tech-num flex items-center gap-2 text-[10px] text-fg-muted">
                        {c.city && <span>{c.city}</span>}
                        <span>bakiye {formatTRY(c.currentBalance)}</span>
                        <span
                          className={
                            available < 0
                              ? "font-bold text-danger"
                              : "text-success"
                          }
                        >
                          kullanılabilir {formatTRY(c.availableCredit)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
