"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "b2b-theme";

/**
 * Inlined into <head> in layout.tsx and run before paint. Manual choice only —
 * no `prefers-color-scheme` fallback — so first visit is always light and a
 * toggle persists across reloads without a flash of the wrong theme.
 */
export const THEME_INIT_SCRIPT = `
try {
  if (localStorage.getItem('${STORAGE_KEY}') === 'dark') {
    document.documentElement.classList.add('dark');
  }
} catch (_) {}
`;

/** Reads/writes the `dark` class on <html>, kept in sync with localStorage. */
export function useTheme() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
      } catch {
        // Gizli sekme vb. — tema geçişi yine çalışır, sadece kalıcı olmaz.
      }
      return next;
    });
  }, []);

  return { isDark, toggle };
}
