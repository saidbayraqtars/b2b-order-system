"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, X } from "lucide-react";
import type { AnnouncementView } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

// Vitrin duyuruları: kayan şerit (TICKER), katalog üstü bant (BANNER) ve
// açılış penceresi (MODAL).
//
// Kapatma kararı tarayıcıda tutulur (duyuru id'si bazında). Sunucuya yazılmıyor
// çünkü bu bir tercih değil, bir "gördüm" işareti: aynı kullanıcı başka bir
// cihazda duyuruyu tekrar görsün — kaçırılmış bir kampanya duyurusu, iki kez
// gösterilmiş olandan pahalıdır.

const DISMISS_KEY = "b2b-dismissed-announcements";

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function useDismissal() {
  const [dismissed, setDismissed] = useState<string[] | null>(null);

  // İlk okuma effect içinde: sunucuda localStorage yok, ilk render'da okumak
  // hidrasyon uyuşmazlığı üretirdi. null = "henüz bilmiyoruz", hiçbir şey çizme.
  useEffect(() => setDismissed(readDismissed()), []);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = [...(prev ?? []), id];
      try {
        localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-100)));
      } catch {
        // Gizli sekme: kapatma bu oturum için çalışır, kalıcı olmaz.
      }
      return next;
    });
  }, []);

  return { dismissed, dismiss };
}

const TONE_BANNER: Record<string, string> = {
  brand: "border-line-strong bg-subtle text-ink",
  neutral: "border-line bg-sunken text-ink-muted",
  success: "border-positive/30 bg-positive/10 text-positive",
  warning: "border-caution/30 bg-caution/10 text-caution",
  danger: "border-critical/30 bg-critical/10 text-critical",
  info: "border-line-strong bg-subtle text-ink-muted",
};

export function Announcements({ companyId }: { companyId: string }) {
  const { dismissed, dismiss } = useDismissal();

  const query = useQuery({
    queryKey: ["announcements", companyId],
    queryFn: () =>
      apiGet<{ announcements: AnnouncementView[] }>(
        `/api/announcements?companyId=${encodeURIComponent(companyId)}`,
      ),
    staleTime: 60_000,
  });

  // Duyurular gelmeden ya da kapatılanlar okunmadan hiçbir şey çizilmez.
  if (!query.data || dismissed === null) return null;

  const visible = query.data.announcements.filter(
    (a) => !(a.dismissible && dismissed.includes(a.id)),
  );
  if (visible.length === 0) return null;

  const tickers = visible.filter((a) => a.placement === "TICKER");
  const banners = visible.filter((a) => a.placement === "BANNER");
  const modal = visible.find((a) => a.placement === "MODAL");

  return (
    <>
      {tickers.length > 0 && <Ticker items={tickers} />}
      {banners.map((a) => (
        <Banner key={a.id} item={a} onDismiss={() => dismiss(a.id)} />
      ))}
      {modal && <Modal item={modal} onDismiss={() => dismiss(modal.id)} />}
    </>
  );
}

/** Kayan şerit. İçerik iki kez basılır; %50 kayınca dikiş görünmez. */
function Ticker({ items }: { items: AnnouncementView[] }) {
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-line bg-panel">
      <div className="marquee-track flex w-max animate-marquee">
        <TickerRun items={items} />
        {/* İkinci kopya sonsuz akış için var; ekran okuyucu aynı metni iki kez
            okumasın diye gizlenir. */}
        <TickerRun items={items} aria-hidden />
      </div>
    </div>
  );
}

function TickerRun({
  items,
  "aria-hidden": ariaHidden,
}: {
  items: AnnouncementView[];
  "aria-hidden"?: boolean;
}) {
  return (
    <div
      aria-hidden={ariaHidden ? "true" : undefined}
      className="flex shrink-0 items-center"
    >
      {items.map((a) => (
        <span key={a.id} className="flex items-center gap-2 px-6 py-2">
          <span className="h-1 w-1 shrink-0 rounded-full bg-accent" />
          <span className="text-label uppercase text-ink">{a.title}</span>
          {a.body && <span className="text-xs text-ink-faint">{a.body}</span>}
          {a.linkUrl && (
            <Link
              href={a.linkUrl}
              tabIndex={ariaHidden ? -1 : undefined}
              className="text-xs font-medium text-ink underline-offset-2 hover:underline"
            >
              {a.linkLabel ?? "İncele"}
            </Link>
          )}
        </span>
      ))}
    </div>
  );
}

/** Katalog üstü bant — çarpıyla kapatılır. */
function Banner({
  item,
  onDismiss,
}: {
  item: AnnouncementView;
  onDismiss: () => void;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex items-start gap-3 rounded-lg border px-4 py-3",
        TONE_BANNER[item.tone] ?? TONE_BANNER.neutral,
      )}
    >
      <Megaphone className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-label uppercase">{item.title}</p>
        {item.body && <p className="mt-1 text-body-sm">{item.body}</p>}
        {item.linkUrl && (
          <Link
            href={item.linkUrl}
            className="mt-2 inline-block text-xs font-medium underline underline-offset-4"
          >
            {item.linkLabel ?? "İncele"} →
          </Link>
        )}
      </div>
      {item.dismissible && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Duyuruyu kapat"
          className="-mr-1 -mt-1 shrink-0 p-1 opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Açılış penceresi. Escape ve arka plan tıklaması da kapatır. */
function Modal({
  item,
  onDismiss,
}: {
  item: AnnouncementView;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-md animate-fade-in rounded-lg border border-line bg-panel p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <span className="tech-label">Duyuru</span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Kapat"
            className="-mr-1 -mt-1 p-1 text-ink-faint transition-colors hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 className="text-headline-sm text-ink">{item.title}</h2>
        {item.body && (
          <p className="mt-2 text-body-sm text-ink-muted">{item.body}</p>
        )}
        <div className="mt-5 flex items-center gap-2">
          {item.linkUrl && (
            <Link
              href={item.linkUrl}
              onClick={onDismiss}
              className="inline-flex h-9 items-center rounded bg-accent px-4 text-body-sm font-medium text-on-accent transition-opacity hover:opacity-90"
            >
              {item.linkLabel ?? "İncele"}
            </Link>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-9 items-center rounded border border-line px-4 text-body-sm font-medium text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
