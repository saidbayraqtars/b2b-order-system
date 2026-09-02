"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Katlanır bölümlerin ortak mekaniği.
//
// Neden gerekiyor: ölçtüğümüzde günlük kullanılan yirmi üç ekran iki ekran
// boyundan uzundu (`docs/design/YOGUNLUK-RAPORU.md`). Çözüm metni kısaltmak
// değil — açıklamalar projenin en iyi yanlarından biri — katlamak.
//
// Üç kural, üçü de erişilebilirlik için:
//
// 1. Başlık gerçek bir `<button aria-expanded>`. Tıklanabilir `<div>` klavyeyle
//    ulaşılmıyor.
// 2. Kapalı içerik DOM'dan **çıkıyor** (`{open && …}`), `hidden` ile
//    saklanmıyor — saklanan içerik hâlâ sekme sırasında duruyor.
// 3. Dönen ok `motion-reduce:transition-none` taşıyor; hareketi azaltılmış
//    kullanıcıda animasyon yok (`auth-stage.tsx`teki kuralın aynısı).

const STORE_PREFIX = "b2b.open.";

/**
 * Açıklık durumu + tarayıcıda hatırlama.
 *
 * İlk çizim her zaman `defaultOpen` ile oluyor, kayıtlı değer ondan sonra
 * uygulanıyor: sunucunun bilmediği bir değerle çizmek hidrasyonu bozardı.
 * `storageKey` yoksa durum kalıcı değil (geçici/tek kullanımlık bölümler).
 */
export function useOpenState(
  storageKey: string | undefined,
  defaultOpen: boolean,
): { open: boolean; toggle: () => void } {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = window.localStorage.getItem(STORE_PREFIX + storageKey);
      if (saved === "1" || saved === "0") setOpen(saved === "1");
    } catch {
      // Gizli sekmede localStorage okumak atabiliyor. Kayıt yoksa varsayılan.
    }
  }, [storageKey]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey) {
        try {
          window.localStorage.setItem(
            STORE_PREFIX + storageKey,
            next ? "1" : "0",
          );
        } catch {
          // Yazamıyorsak da açılıp kapanmaya devam etsin.
        }
      }
      return next;
    });
  }, [storageKey]);

  return { open, toggle };
}

/** Açık/kapalı okunu çizen ortak parça — `Panel` ile `Disclosure` aynısını kullanıyor. */
export function DisclosureChevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      aria-hidden
      className={cn(
        "h-4 w-4 shrink-0 text-ink-faint transition-transform motion-reduce:transition-none",
        open && "rotate-90",
      )}
    />
  );
}

/** Kapalıyken başlığın yanında duran künye — "içinde ne var" sorusunun cevabı. */
export function DisclosureBadge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded bg-subtle px-1.5 py-0.5 text-xs tabular-nums text-ink-muted">
      {children}
    </span>
  );
}

/**
 * Panel çerçevesi olmayan açılır bölüm — süzgeç şeridi, ekleme formu, form
 * içindeki ileri düzey alanlar.
 *
 * `badge` boş bırakılmamalı: kapalı bir süzgeç şeridi, gizli bir süzgeç listeyi
 * kestiğinde kullanıcıyı yanıltır. Sayı bunu önler.
 */
export function Disclosure({
  label,
  badge,
  storageKey,
  defaultOpen = false,
  children,
  className,
}: {
  label: string;
  badge?: ReactNode;
  /** Verilirse açıklık durumu tarayıcıda saklanır. */
  storageKey?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const { open, toggle } = useOpenState(storageKey, defaultOpen);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 rounded py-1.5 text-left text-body-sm font-medium",
          "text-ink-muted transition-colors hover:text-ink",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-muted",
        )}
      >
        <DisclosureChevron open={open} />
        <span className="truncate">{label}</span>
        {badge != null && badge !== "" && badge !== 0 && (
          <DisclosureBadge>{badge}</DisclosureBadge>
        )}
      </button>
      {open && <div className="pt-1">{children}</div>}
    </div>
  );
}

/**
 * `Note`un katlanır hâli. Kendi dosyasında değil burada, çünkü `ui.tsx` sunucu
 * tarafında da kullanılıyor — durum tutan parça istemci sınırının bu yanında
 * kalmalı.
 */
export function CollapsibleNote({
  title,
  storageKey,
  defaultOpen,
  className,
  children,
}: {
  title: string;
  storageKey?: string;
  defaultOpen: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { open, toggle } = useOpenState(storageKey, defaultOpen);

  return (
    <aside className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(
          "-ml-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-body-sm font-semibold",
          "text-ink-muted transition-colors hover:text-ink",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-muted",
        )}
      >
        <DisclosureChevron open={open} />
        {title}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </aside>
  );
}

/**
 * Form içindeki katlanır alan kümesi.
 *
 * `Disclosure`dan farkı `<fieldset>`/`<legend>` olarak kalması: onay kutusu
 * kümelerinde bu ikili ekran okuyucuya "bu dört kutu tek soruya ait" diyen tek
 * şey ve düz bir `<div>`e çevirmek onu siler. Düğme `<legend>`in **içinde** —
 * geçerli HTML ve başlık hâlâ kümenin adı.
 */
export function CollapsibleFieldset({
  legend,
  summary,
  storageKey,
  defaultOpen = false,
  className,
  children,
}: {
  legend: string;
  /** Kapalıyken başlığın yanındaki tek satır künye. */
  summary?: ReactNode;
  storageKey?: string;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { open, toggle } = useOpenState(storageKey, defaultOpen);

  return (
    <fieldset
      className={cn(
        "rounded border border-line",
        // Kapalıyken üst dolgu yok: `<legend>` çizginin üstünde durduğu için
        // `p-3` boş bir kutuyu on iki piksel daha uzatıyordu.
        open ? "p-3" : "px-3 pb-2 pt-1",
        className,
      )}
    >
      <legend className="px-1">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            "tech-label flex items-center gap-1.5 rounded",
            "transition-colors hover:text-ink",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-muted",
          )}
        >
          <DisclosureChevron open={open} />
          {legend}
          {!open && summary != null && (
            <span className="font-normal normal-case tracking-normal text-ink-faint">
              {summary}
            </span>
          )}
        </button>
      </legend>
      {open && children}
    </fieldset>
  );
}
