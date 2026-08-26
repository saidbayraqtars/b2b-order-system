"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Aydınlık temaya geç" : "Karanlık temaya geç"}
      aria-label="Temayı değiştir"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
