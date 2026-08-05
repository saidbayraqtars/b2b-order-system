import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export interface NavLink {
  href: string;
  label: string;
  icon?: LucideIcon;
}

/**
 * Tek, paylaşılan uygulama üst barı. admin/portal/rep kendi link listesini ve
 * "current"ını verir; marka işareti, tema anahtarı ve çıkış her yerde aynıdır.
 * Önceden 3 ekranın her biri bu barı elle çiziyordu — artık tek yerden değişir.
 */
export function AppHeader({
  context,
  links,
  current,
  userLabel,
  right,
}: {
  /** Marka satırının altında görünen ikinci satır: firma adı, "Yönetim Paneli" vb. */
  context?: string;
  links: NavLink[];
  current: string;
  userLabel: string;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 mb-6 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-sm shadow-brand-600/30">
            B
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="font-display text-sm font-bold text-neutral-900 dark:text-white">
              B2B Portal
            </span>
            {context && (
              <span className="mt-0.5 text-xs text-neutral-500">{context}</span>
            )}
          </span>
        </Link>

        <nav className="flex flex-1 flex-wrap items-center gap-1">
          {links.map((l) => {
            const Icon = l.icon;
            const active = l.href === current;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          {right}
          <ThemeToggle />
          <Link
            href="/hesabim"
            className="hidden px-2 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white sm:inline"
          >
            {userLabel}
          </Link>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
