"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiPut } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

// Basit / gelişmiş görünüm.
//
// Varsayılan **basit**: ileri ayarlar (parti/SKT, çift birim…) ve nadir
// kullanılan ekranlar (sayfa düzeni, bakım işleri…) gizli. Bir alan kullanımda
// ise basit görünümde de görünür — dolu bir ayarı gizlemek, kullanıcının
// bilmediği bir şeyin fiyatı ya da stoğu değiştirmesi demek olurdu.
//
// Yalnızca görüntü. Kapı izne bakar; basit görünümdeki yönetici gizlenen
// ekrana adresle girebilir.

const UiModeContext = createContext(false);

export function UiModeProvider({
  advanced,
  children,
}: {
  advanced: boolean;
  children: ReactNode;
}) {
  return <UiModeContext.Provider value={advanced}>{children}</UiModeContext.Provider>;
}

export function useAdvancedView(): boolean {
  return useContext(UiModeContext);
}

/**
 * Yalnızca gelişmiş görünümde çizilir — ya da `inUse` doğruysa her zaman.
 * Basit görünümde gizlendiğinde yerine tek satırlık bir ipucu bırakılabilir.
 */
export function Advanced({
  inUse = false,
  hint,
  children,
}: {
  inUse?: boolean;
  /** Basit görünümde gizlenince gösterilecek tek satır. */
  hint?: string;
  children: ReactNode;
}) {
  const advanced = useAdvancedView();
  if (advanced || inUse) return <>{children}</>;
  return hint ? <p className="mt-2 text-xs text-ink-faint">{hint}</p> : null;
}

/** Kenar çubuğunun altındaki geçiş düğmesi. */
export function ViewModeToggle() {
  const advanced = useAdvancedView();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={advanced}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await apiPut("/api/account/gorunum", { advanced: !advanced });
          // Menü ve formlar sunucudan gelen tercihle çiziliyor.
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
      className="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-body-sm text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-60"
    >
      <span>Gelişmiş görünüm</span>
      <span
        aria-hidden="true"
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full transition-colors",
          advanced ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-panel transition-all",
            advanced ? "left-3.5" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}
