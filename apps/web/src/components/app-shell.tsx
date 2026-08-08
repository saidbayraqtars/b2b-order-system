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
    <header className="sticky top-0 z-30 mb-6 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          {/* Marka işareti paketin iki kimlik renginden geçer: tek renkli bir
              kare her tasarımda aynı görünürdü, oysa ayırt edici olan tam da
              bu ikili. */}
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-sm font-bold text-on-primary shadow-primary">
            B
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="font-display text-sm font-bold text-fg">
              B2B Portal
            </span>
            {context && (
              <span className="mt-0.5 text-xs text-fg-muted">{context}</span>
            )}
          </span>
        </Link>

        <nav className="flex flex-1 flex-wrap items-center gap-1">
          {links.map((l) => {
            const Icon = l.icon;
            // Bağlantılar sorgu taşıyabiliyor (portalda seçili firma gibi);
            // aktif sekme yola göre bulunur, tam metne göre değil.
            const active = l.href.split("?")[0] === current;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary-soft text-on-primary-soft"
                    : "text-fg-muted hover:bg-surface3 hover:text-fg",
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
            className="hidden px-2 text-sm text-fg-muted hover:text-fg sm:inline"
          >
            {userLabel}
          </Link>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
