"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2, Package, ReceiptText, Search } from "lucide-react";
import type { SearchHit } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

// Genel arama (Ctrl+K): ürün, firma, sipariş no tek kutudan.
//
// Kutunun kendisi üst şeritte duruyor ve tıklanabiliyor — kısayol tek yol
// değil. Sebep iki katlı: bir tuş kombinasyonunu kimse kendiliğinden bulmuyor,
// ve **fotoğraflanamayan ekran doğru göründüğü söylenemeyen ekrandır**; betik
// düğmelere basmıyor ama açık bir kutuyu görebiliyor.
//
// Kapsamın tamamı sunucuda (`packages/services/src/search.ts`): burada yalnızca
// gelen satırlar çiziliyor. İstemcinin süzeceği bir şey olsaydı, süzgeç
// istemcide olurdu — ve orada olan hiçbir şey güvenlik sınırı değildir.

const ICON = {
  product: Package,
  company: Building2,
  order: ReceiptText,
} as const;

const KIND_LABEL = {
  product: "Ürün",
  company: "Firma",
  order: "Sipariş",
} as const;

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K / ⌘K. `keydown` pencerede dinleniyor çünkü kısayol ekranın her
  // yerinden çalışmalı; tarayıcının kendi adres çubuğu araması ezilmesin diye
  // yalnızca yakalandığında `preventDefault`.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setTerm("");
      setCursor(0);
    }
  }, [open]);

  // Aramayı yazarken bekletmek: her harf bir sorgu açmıyor.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 200);
    return () => clearTimeout(t);
  }, [term]);

  const query = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () =>
      apiGet<{ hits: SearchHit[] }>(
        `/api/search?q=${encodeURIComponent(debounced)}`,
      ),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });

  const hits = query.data?.hits ?? [];

  function go(hit: SearchHit | undefined) {
    if (!hit) return;
    setOpen(false);
    router.push(hit.href);
  }

  return (
    <>
      {/* Şeritteki kutu. Gerçek bir girdi değil bir düğme: yazmaya başlamak
          pencereyi açıyor ve iki ayrı yerde iki ayrı arama durumu tutmanın
          anlamı yok. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded border border-line bg-panel px-3",
          "text-body-sm text-ink-faint transition-colors hover:border-line-strong hover:text-ink-muted",
        )}
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Ürün, firma, sipariş no…</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink-faint sm:inline">
          Ctrl K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-scrim/40 p-4 pt-[12vh] backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Genel arama"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-xl overflow-clip rounded-lg border border-line bg-panel shadow-pop">
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="h-4 w-4 shrink-0 text-ink-faint" />
              <input
                ref={inputRef}
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCursor((c) => Math.min(c + 1, hits.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => Math.max(c - 1, 0));
                  }
                  if (e.key === "Enter") go(hits[cursor]);
                }}
                placeholder="Ürün adı, SKU, firma, sipariş no…"
                aria-label="Arama"
                className="h-12 w-full bg-transparent text-body-md text-ink outline-none placeholder:text-ink-faint"
              />
            </div>

            <div className="max-h-80 overflow-y-auto">
              {debounced.length < 2 ? (
                <p className="px-4 py-6 text-body-sm text-ink-faint">
                  En az iki harf yazın.
                </p>
              ) : query.isFetching && hits.length === 0 ? (
                <p className="px-4 py-6 text-body-sm text-ink-faint">
                  Aranıyor…
                </p>
              ) : hits.length === 0 ? (
                <p className="px-4 py-6 text-body-sm text-ink-faint">
                  Sonuç yok. Yetkiniz olmayan kayıtlar aramada da görünmez.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {hits.map((hit, i) => {
                    const Icon = ICON[hit.kind];
                    return (
                      <li key={`${hit.kind}-${hit.id}`}>
                        <button
                          type="button"
                          onMouseEnter={() => setCursor(i)}
                          onClick={() => go(hit)}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                            i === cursor ? "bg-subtle" : "hover:bg-subtle",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-ink-faint" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body-sm text-ink">
                              {hit.title}
                            </span>
                            {hit.subtitle && (
                              <span className="block truncate text-xs text-ink-faint">
                                {hit.subtitle}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-label uppercase text-ink-faint">
                            {KIND_LABEL[hit.kind]}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
