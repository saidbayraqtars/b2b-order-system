"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Palette, X } from "lucide-react";
import { THEME_PACKS, resolveTheme, schemesOf } from "@repo/theme";
import type { SchemeName } from "@repo/theme";
import { PACK_COOKIE, PACK_COOKIE_MAX_AGE, SCHEME_COOKIE } from "@/lib/theme-pack";
import { cn } from "@/lib/utils";

/**
 * Vitrinin tasarım kabuğu.
 *
 * İçindeki her şey `bg-surface`, `text-fg`, `rounded-lg` gibi *anlamsal*
 * sınıflarla yazılır; bu sınıfların arkasındaki değerleri buradaki iki öznitelik
 * belirler. Paket değiştirmek tek bir setState — ne yeniden derleme, ne sunucuya
 * gidiş, ne sayfa yenileme. Sunum sırasında cümlenin ortasında kimlik
 * değiştirebilmek istendiği için başka türlüsü işe yaramazdı.
 *
 * Kapsam bilerek `<html>` değil bu sarmalayıcı: yönetim paneli, plasiyer ve
 * kurye ekranları dışarıda kalır ve nötr dilinde çalışmayı sürdürür.
 */

interface ThemeScopeValue {
  packId: string;
  scheme: SchemeName;
  setPack: (id: string) => void;
  setScheme: (scheme: SchemeName) => void;
}

const ThemeScopeContext = createContext<ThemeScopeValue | null>(null);

export function useThemeScope(): ThemeScopeValue {
  const value = useContext(ThemeScopeContext);
  if (!value) throw new Error("useThemeScope, ThemeScope içinde çağrılmalı");
  return value;
}

function remember(name: string, value: string) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${PACK_COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    // Çerez engelliyse tema yine değişir, sadece yenilemede kalıcı olmaz.
  }
}

export function ThemeScope({
  initialPack,
  initialScheme,
  switcher,
  className,
  children,
}: {
  initialPack: string;
  initialScheme: SchemeName;
  /** Kurulum bunu kapatabilir — bkz. tenant.json → theme.switcher. */
  switcher: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [packId, setPackId] = useState(initialPack);
  const [scheme, setSchemeState] = useState<SchemeName>(initialScheme);

  const setPack = useCallback((id: string) => {
    // Yeni paket o şemayı taşımıyorsa (NEO-MART yalnızca koyu) şema da düzeltilir;
    // aksi hâlde öznitelik ikilisi hiçbir kurala uymaz ve kutu boyasız kalır.
    const resolved = resolveTheme(id, null);
    setPackId(resolved.pack.id);
    setSchemeState((current) => {
      const next = schemesOf(resolved.pack).includes(current)
        ? current
        : resolved.pack.defaultScheme;
      remember(SCHEME_COOKIE, next);
      return next;
    });
    remember(PACK_COOKIE, resolved.pack.id);
  }, []);

  const setScheme = useCallback((next: SchemeName) => {
    setSchemeState(next);
    remember(SCHEME_COOKIE, next);
  }, []);

  const value = useMemo(
    () => ({ packId, scheme, setPack, setScheme }),
    [packId, scheme, setPack, setScheme],
  );

  return (
    <ThemeScopeContext.Provider value={value}>
      <div
        data-pack={packId}
        data-scheme={scheme}
        className={cn("min-h-screen bg-bg font-sans text-fg", className)}
      >
        {children}
        {switcher && <ThemeSwitcher />}
      </div>
    </ThemeScopeContext.Provider>
  );
}

/**
 * Sunum anahtarı.
 *
 * Kapalıyken tek bir palet düğmesi; açıkken paket listesi. Klavyeden `Alt+T`
 * sıradaki pakete geçirir — dizüstüyle sunum yapan birinin fareyi bulup köşeye
 * gitmesi, "şimdi de şu tasarımı göstereyim" cümlesinden uzun sürüyor.
 */
function ThemeSwitcher() {
  const { packId, scheme, setPack, setScheme } = useThemeScope();
  const [open, setOpen] = useState(false);

  const active = resolveTheme(packId, scheme).pack;
  const schemes = schemesOf(active);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key.toLowerCase() !== "t") return;
      event.preventDefault();
      const index = THEME_PACKS.findIndex((p) => p.id === packId);
      const next = THEME_PACKS[(index + 1) % THEME_PACKS.length];
      if (next) setPack(next.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [packId, setPack]);

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {open ? (
        <div className="w-72 rounded-xl border border-border bg-surface p-3 shadow-card-hover">
          <div className="mb-2 flex items-center justify-between">
            <span className="tech-label">Tasarım paketi</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Kapat"
              className="rounded-full p-1 text-fg-muted transition-colors hover:bg-surface3 hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <ul className="space-y-1">
            {THEME_PACKS.map((pack) => (
              <li key={pack.id}>
                <button
                  type="button"
                  onClick={() => setPack(pack.id)}
                  aria-current={pack.id === packId ? "true" : undefined}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                    pack.id === packId
                      ? "border-primary bg-primary-soft text-on-primary-soft"
                      : "border-border text-fg hover:bg-surface3",
                  )}
                >
                  <span className="block text-sm font-medium">{pack.name}</span>
                  <span className="mt-0.5 block text-xs text-fg-muted">{pack.tagline}</span>
                </button>
              </li>
            ))}
          </ul>

          {/* Tek şemalı bir pakette aydınlık/karanlık düğmesi göstermek,
              basıldığında hiçbir şey yapmayan bir düğme göstermektir. */}
          {schemes.length > 1 && (
            <div className="mt-2 flex gap-1 border-t border-border pt-2">
              {schemes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScheme(s)}
                  className={cn(
                    "flex-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                    s === scheme
                      ? "bg-primary text-on-primary"
                      : "text-fg-muted hover:bg-surface3",
                  )}
                >
                  {s === "light" ? "Aydınlık" : "Karanlık"}
                </button>
              ))}
            </div>
          )}

          <p className="mt-2 text-[10px] text-fg-muted">
            Alt+T ile sıradaki pakete geçer. Seçim yalnızca bu tarayıcıda geçerli.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={`Tasarım paketi: ${active.name}`}
          aria-label="Tasarım paketini değiştir"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-fg-muted shadow-card transition-colors hover:text-primary"
        >
          <Palette className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
