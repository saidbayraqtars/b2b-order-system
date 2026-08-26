"use client";

// İkonlar istemci tarafında kalmalı: `SidebarShell` bir istemci bileşeni ve
// lucide ikonları `"use client"` taşımıyor. Bu dosya sunucuda kalsaydı, link
// listesindeki ikon bileşenleri sınırdan geçmeye çalışır ve React "Functions
// cannot be passed directly to Client Components" diye düşerdi — bazı
// rotalarda düşüyordu da. Bileşenin aldığı her prop zaten serileştirilebilir.

import type { ReactNode } from "react";
import {
  BarChart3,
  LayoutDashboard,
  MapPin,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { hasPermission, type Permission } from "@repo/types";
import { SidebarShell, type SidebarLink } from "@/components/app-sidebar";
import { CompanySwitcher } from "@/components/storefront/company-switcher";

/**
 * Plasiyer masasının kabuğu — panel, sipariş, tahsilat, ziyaret, raporlar.
 *
 * Tek yerde duruyor çünkü portal tarafında tam tersi yapılmış ve her alt sayfa
 * kendi link listesini elle çizdiği için bazı sayfalardan bazılarına
 * gidilemiyordu (Faz 1'de düzeltildi). Aynı hatayı burada baştan yapmıyoruz.
 *
 * Seçili firma varsa **her bağlantıda taşınır**: tahsilattan ziyarete geçen
 * plasiyer firmayı yeniden seçmek zorunda kalmamalı.
 */
export function RepNav({
  userName,
  permissions,
  current,
  companyId,
  companyName,
  /** Firma seçici gösterilsin mi — firma kavramı olan ekranlarda. */
  showCompany = false,
  children,
}: {
  userName: string;
  /** Hesabın izin kümesi; menü buna göre süzülür (ekranlar ayrıca kapalıdır). */
  permissions: readonly Permission[];
  /** Firma seçicinin geri döneceği yol. Aktif bağlantı yoldan bulunur. */
  current: string;
  companyId?: string | null;
  companyName?: string | null;
  showCompany?: boolean;
  children: ReactNode;
}) {
  const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  const can = (p: Permission) => hasPermission(permissions, p);

  // Panel her zaman durur: yetkisi kısılmış bir plasiyerin de gidebileceği bir
  // yer kalmalı, aksi hâlde menü tamamen boşalır.
  const links: SidebarLink[] = [
    { href: "/rep", label: "Panel", icon: LayoutDashboard },
  ];
  if (can("orders.create")) {
    links.push({
      href: `/portal${q}`,
      label: "Sipariş gir",
      icon: ShoppingBag,
    });
  }
  if (can("cash.manage")) {
    links.push({ href: `/rep/tahsilat${q}`, label: "Tahsilat", icon: Wallet });
  }
  if (can("visits.manage")) {
    links.push({ href: `/rep/ziyaret${q}`, label: "Ziyaret", icon: MapPin });
  }
  if (can("reports.build")) {
    links.push({ href: "/reports", label: "Raporlar", icon: BarChart3 });
  }

  return (
    <SidebarShell
      context={
        showCompany ? (companyName ?? "Firma seçilmedi") : "Plasiyer Paneli"
      }
      groups={[{ title: "", links }]}
      userLabel={userName}
      actions={
        showCompany ? (
          <CompanySwitcher
            currentCompanyId={companyId ?? null}
            currentCompanyName={companyName ?? null}
            basePath={current}
          />
        ) : undefined
      }
    >
      {children}
    </SidebarShell>
  );
}
