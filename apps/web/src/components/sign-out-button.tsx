"use client";

import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

/**
 * Çıkış düğmesi.
 *
 * İki yerde iki farklı görüntüsü var: kenar çubuğunun altında ikon + "Çıkış"
 * yazan geniş bir satır, dar yerlerde yalnızca ikon. Davranış (oturumu kapat,
 * girişe dön) tek yerde kalsın diye görünüm dışarıdan veriliyor.
 */
export function SignOutButton({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      title="Çıkış yap"
      aria-label="Çıkış yap"
      className={cn(
        !className &&
          "flex h-9 w-9 shrink-0 items-center justify-center rounded text-ink-faint transition-colors hover:bg-subtle hover:text-critical",
        className,
      )}
    >
      {children ?? <LogOut className="h-4 w-4" />}
    </button>
  );
}
