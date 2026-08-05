import type { ReactNode } from "react";
import { BarChart3, CheckSquare, ClipboardList, Receipt, ShoppingBag, Users } from "lucide-react";
import type { Role } from "@repo/types";
import { AppHeader, type NavLink } from "@/components/app-shell";

/**
 * Portalın 5 alt sayfası (katalog/sipariş/ekstre/onay/kullanıcı) eskiden her
 * biri kendi başlığını elle çiziyordu — biri "Onaylar"a link veriyor biri
 * vermiyordu. Tek nav'a taşımak görünümü birleştirdiği kadar bu boşluğu da
 * kapatır: artık her sayfadan her sayfaya gidilebiliyor.
 */
export function PortalNav({
  role,
  companyName,
  userName,
  current,
  right,
}: {
  role: Role;
  companyName: string;
  userName: string;
  current: string;
  right?: ReactNode;
}) {
  const links: NavLink[] = [
    { href: "/portal", label: "Katalog", icon: ShoppingBag },
    { href: "/portal/orders", label: "Siparişlerim", icon: ClipboardList },
    { href: "/portal/statement", label: "Ekstre", icon: Receipt },
  ];
  if (role === "COMPANY_ADMIN") {
    links.push(
      { href: "/portal/approvals", label: "Onaylar", icon: CheckSquare },
      { href: "/portal/users", label: "Kullanıcılar", icon: Users },
    );
  }
  if (role === "COMPANY_ADMIN" || role === "SUPER_ADMIN") {
    links.push({ href: "/reports", label: "Raporlar", icon: BarChart3 });
  }

  return (
    <AppHeader
      context={companyName}
      links={links}
      current={current}
      userLabel={userName}
      right={right}
    />
  );
}
