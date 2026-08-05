import {
  BarChart3,
  LayoutDashboard,
  MapPin,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { AppHeader, type NavLink } from "@/components/app-shell";
import { CompanySwitcher } from "@/components/storefront/company-switcher";

/**
 * Plasiyer masasının üst barı — panel, sipariş, tahsilat, ziyaret, raporlar.
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
  current,
  companyId,
  companyName,
  /** Firma seçici gösterilsin mi — firma kavramı olan ekranlarda. */
  showCompany = false,
}: {
  userName: string;
  current: string;
  companyId?: string | null;
  companyName?: string | null;
  showCompany?: boolean;
}) {
  const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";

  const links: NavLink[] = [
    { href: "/rep", label: "Panel", icon: LayoutDashboard },
    { href: `/portal${q}`, label: "Sipariş gir", icon: ShoppingBag },
    { href: `/rep/tahsilat${q}`, label: "Tahsilat", icon: Wallet },
    { href: `/rep/ziyaret${q}`, label: "Ziyaret", icon: MapPin },
    { href: "/reports", label: "Raporlar", icon: BarChart3 },
  ];

  return (
    <AppHeader
      context={showCompany ? (companyName ?? "Firma seçilmedi") : "Plasiyer Paneli"}
      links={links}
      current={current}
      userLabel={userName}
      right={
        showCompany ? (
          <CompanySwitcher
            currentCompanyId={companyId ?? null}
            currentCompanyName={companyName ?? null}
            basePath={current}
          />
        ) : undefined
      }
    />
  );
}
