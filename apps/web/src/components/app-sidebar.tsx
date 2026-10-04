"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { LogOut, Menu, UserRound, X } from "lucide-react";
import { useBrand } from "@/components/brand";
import { CommandPalette } from "@/components/command-palette";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Uygulamanın tek kabuğu: solda sabit gezinme sütunu, üstte ince bir şerit.
 *
 * Neden üç ayrı kabuk değil de bir tane: yönetim paneli kenar çubuğu, portal
 * üst barı ve plasiyer üst barı ayrı ayrı yazılmıştı; aynı kullanıcı gün içinde
 * ikisini birden görüyor ve arayüz her geçişte yer değiştiriyordu. Bölüm sayısı
 * farklı (yönetimde 25, portalda 6) ama *yapı* aynı olmalı — portalda gruplar
 * başlıksız tek liste hâlinde akar, o kadar.
 *
 * Aktif bağlantı `usePathname` ile bulunur, sayfadan `current` geçilmez: alt
 * kırılımlar (firma detayı, ürün düzenleme) kendiliğinden üst bölümü işaretler.
 */

export interface SidebarLink {
  href: string;
  label: string;
  /** Lucide ya da Reicon bileşeni — ikisi de `className` alıyor. */
  icon?: ComponentType<{ className?: string }>;
}

export interface SidebarGroup {
  /** Boş bırakılırsa başlık çizilmez — kısa, tek parça menüler için. */
  title: string;
  links: readonly SidebarLink[];
}

export function SidebarShell({
  /** Verilmezse kiracının adı (bkz. `lib/tenant-brand.ts`). */
  brand,
  context,
  groups,
  userLabel,
  /** Üst şeridin ortasındaki arama kutusu. Yoksa şerit boş kalır, kutu çizilmez. */
  search,
  /** Üst şeridin sağındaki ek düğmeler: firma seçici, sepet, yazdır… */
  actions,
  /** Kenar çubuğunun altında, hesap bağlantısının üstünde: görünüm düğmesi. */
  footer,
  children,
}: {
  brand?: string;
  /** Marka satırının altındaki ikinci satır: "Yönetim Paneli", firma adı… */
  context?: string;
  groups: readonly SidebarGroup[];
  userLabel: string;
  search?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const tenant = useBrand();
  const name = brand ?? tenant;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Gezinme sonrası açık kalan çekmece mobilde içeriğin yarısını kapatıyor.
  useEffect(() => setOpen(false), [pathname]);

  // En uzun eşleşen yol kazanır: "/admin" her şeyin ön eki olduğu için aksi
  // hâlde her ekranda "Panel" aktif görünürdü. Bağlantılar sorgu taşıyabildiği
  // için (portalda seçili firma) karşılaştırma yoldan önceki parçaya bakar.
  const active = groups
    .flatMap((g) => g.links)
    .map((l) => l.href.split("?")[0] ?? l.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div className="flex min-h-screen bg-surface">
      {open && (
        <button
          type="button"
          aria-label="Menüyü kapat"
          className="fixed inset-0 z-20 bg-scrim/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col border-r border-line bg-panel transition-transform",
          "md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center gap-3 px-4 py-5">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-subtle text-body-md font-bold text-ink">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-body-md font-bold leading-tight text-ink">
                {name}
              </span>
              {context && (
                <span className="truncate text-xs leading-tight text-ink-faint">
                  {context}
                </span>
              )}
            </span>
          </Link>
          <button
            type="button"
            aria-label="Menüyü kapat"
            className="ml-auto p-1 text-ink-faint md:hidden"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group, i) => (
            <div key={group.title || i} className="mb-5 last:mb-0">
              {group.title && (
                <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.links.map((l) => {
                  const Icon = l.icon;
                  const isActive = (l.href.split("?")[0] ?? l.href) === active;
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded px-3 py-2 text-body-sm transition-colors",
                        isActive
                          ? "bg-accent font-medium text-on-accent"
                          : "text-ink-muted hover:bg-subtle hover:text-ink",
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

        <div className="shrink-0 border-t border-line px-3 py-3">
          {footer}
          <Link
            href="/hesabim"
            className="flex items-center gap-3 rounded px-3 py-2 text-body-sm text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
          >
            <UserRound className="h-4 w-4 shrink-0" />
            <span className="truncate">{userLabel}</span>
          </Link>
          <SignOutButton className="flex w-full items-center gap-3 rounded px-3 py-2 text-body-sm text-ink-muted transition-colors hover:bg-subtle hover:text-ink">
            <LogOut className="h-4 w-4 shrink-0" />
            Çıkış
          </SignOutButton>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 md:px-8">
          <button
            type="button"
            aria-label="Menü"
            className="-ml-1 p-2 text-ink-muted md:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Dar ekranda arama kutusu varsa başlık çekilir: ikisi yan yana
              sığmıyor ve arama, sayfanın adından daha çok işe yarıyor. */}
          <span
            className={cn(
              "truncate text-body-md font-semibold text-ink md:text-headline-sm",
              "hidden md:inline",
            )}
          >
            {context ?? name}
          </span>

          {/* Ekranın kendi araması varsa (vitrinde ürün araması) o kalıyor;
              yoksa genel arama kutusu geliyor. İkisini yan yana koymak aynı
              şeridi iki kutuya bölerdi ve kullanıcıya hangisinin ne aradığını
              sorardı. */}
          <div className="mx-auto w-full max-w-md">
            {search ?? <CommandPalette />}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {actions}
            <ThemeToggle />
          </div>
        </header>

        {/* Sayfa boşluğu tek yerde. Önceden her ekran kendi `px-4 py-6`sını
            yazıyordu ve üç ayrı gutter ortaya çıkmıştı. */}
        <div className="flex-1 px-4 py-6 md:px-10 md:py-8">{children}</div>
      </div>
    </div>
  );
}
