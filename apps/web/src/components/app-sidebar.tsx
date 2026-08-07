"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, type LucideIcon } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Gruplu sol kenar çubuğu kabuğu.
 *
 * Neden üst bar değil: yönetim panelinde 18 bölüm var ve düz bir üst bar bunu
 * üç satıra sarıyordu — hiyerarşi yok, hangi bölümün hangisiyle ilgili olduğu
 * belirsiz, alan bitince satır ekleniyor. Dikey liste hem gruplanabiliyor hem
 * de bölüm sayısı büyüdükçe kaymaya devam ediyor. Alıcı portalı ve saha
 * ekranları (5-6 bağlantı) üst barda kalır; orada dikey liste sadece yer yer.
 *
 * Aktif bağlantı `usePathname` ile bulunur, sayfadan `current` prop'u geçilmez:
 * alt kırılımlar (firma detayı, ürün düzenleme) kendiliğinden üst bölümü işaretler.
 */

export interface SidebarLink {
  href: string;
  label: string;
  icon?: LucideIcon;
}

export interface SidebarGroup {
  title: string;
  links: readonly SidebarLink[];
}

export function SidebarShell({
  context,
  groups,
  userLabel,
  children,
}: {
  /** Marka satırının altındaki ikinci satır: "Yönetim Paneli" vb. */
  context?: string;
  groups: readonly SidebarGroup[];
  userLabel: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Gezinme sonrası açık kalan çekmece mobilde içeriğin yarısını kapatıyor.
  useEffect(() => setOpen(false), [pathname]);

  // En uzun eşleşen yol kazanır: "/admin" her şeyin ön eki olduğu için aksi
  // hâlde her ekranda "Panel" aktif görünürdü.
  const active = groups
    .flatMap((g) => g.links)
    .filter((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="flex min-h-screen">
      {open && (
        <button
          type="button"
          aria-label="Menüyü kapat"
          className="fixed inset-0 z-20 bg-neutral-900/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white transition-transform dark:border-neutral-800 dark:bg-neutral-950 md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-neutral-200 px-4 py-4 dark:border-neutral-800">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-sm shadow-brand-600/30">
              B
            </span>
            <span className="flex min-w-0 flex-col leading-none">
              <span className="truncate font-display text-sm font-bold text-neutral-900 dark:text-white">
                B2B Portal
              </span>
              {context && (
                <span className="mt-0.5 truncate text-xs text-neutral-500">
                  {context}
                </span>
              )}
            </span>
          </Link>
          <button
            type="button"
            aria-label="Menüyü kapat"
            className="ml-auto p-1 text-neutral-500 md:hidden"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.title} className="mb-4 last:mb-0">
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.links.map((l) => {
                  const Icon = l.icon;
                  const isActive = l.href === active;
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
                      )}
                    >
                      {Icon && <Icon className="h-4 w-4 shrink-0" />}
                      <span className="truncate">{l.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-neutral-200 px-3 py-3 dark:border-neutral-800">
          <Link
            href="/hesabim"
            className="block truncate px-2 pb-2 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          >
            {userLabel}
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-200 bg-white/90 px-4 py-2 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90 md:hidden">
          <button
            type="button"
            aria-label="Menü"
            className="p-1.5 text-neutral-600 dark:text-neutral-300"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-display text-sm font-bold">B2B Portal</span>
          <span className="ml-auto">
            <ThemeToggle />
          </span>
        </header>
        {children}
      </div>
    </div>
  );
}
