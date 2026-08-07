import type { ReactNode } from "react";
import {
  BarChart3,
  CheckSquare,
  ClipboardList,
  MapPin,
  Receipt,
  ShoppingBag,
  Users,
} from "lucide-react";
import { hasPermission, type Permission, type Role } from "@repo/types";
import { AppHeader, type NavLink } from "@/components/app-shell";
import { CompanySwitcher } from "@/components/storefront/company-switcher";

/**
 * Portalın üst barı. İki farklı kullanıcıya hizmet eder:
 *
 *  - Alıcı (firma yöneticisi/personeli): kendi firmasının ekranları. Linkler
 *    sade, companyId taşımaz — firma zaten hesabından geliyor.
 *  - Vekil (plasiyer/süper admin): müşteri adına çalışır. Üstte firma seçici
 *    çıkar ve **her link seçili firmayı taşır**; aksi hâlde "Siparişlerim"e
 *    tıklayınca hangi firmada olunduğu kaybolurdu.
 *
 * Vekil kullanıcıya "Kullanıcılar"/"Onaylar" gösterilmez: bunlar müşterinin
 * kendi iç işleyişi, plasiyerin işi değil.
 */
export function PortalNav({
  role,
  permissions,
  companyName,
  userName,
  current,
  right,
  isProxy = false,
  companyId,
}: {
  role: Role;
  /** Hesabın izin kümesi; menü buna göre süzülür (ekranlar ayrıca kapalıdır). */
  permissions: readonly Permission[];
  companyName: string | null;
  userName: string;
  current: string;
  right?: ReactNode;
  isProxy?: boolean;
  companyId?: string | null;
}) {
  // Vekil kullanıcıda seçili firma her bağlantıda korunur.
  const q =
    isProxy && companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  const can = (p: Permission) => hasPermission(permissions, p);

  const links: NavLink[] = [];
  if (can("products.view")) {
    links.push({ href: `/portal${q}`, label: "Katalog", icon: ShoppingBag });
  }
  if (can("orders.view")) {
    links.push({
      href: `/portal/orders${q}`,
      label: "Siparişler",
      icon: ClipboardList,
    });
  }
  if (can("companies.view")) {
    links.push({ href: `/portal/statement${q}`, label: "Ekstre", icon: Receipt });
    links.push({ href: `/portal/ziyaret${q}`, label: "Ziyaret", icon: MapPin });
  }

  // Rol *ve* izin: onay/kullanıcı ekranları müşterinin kendi iç işleyişi
  // olduğu için vekile hiç gösterilmez, yetkisi olsa bile.
  if (!isProxy && role === "COMPANY_ADMIN") {
    if (can("orders.approve")) {
      links.push({ href: "/portal/approvals", label: "Onaylar", icon: CheckSquare });
    }
    if (can("users.manage")) {
      links.push({ href: "/portal/users", label: "Kullanıcılar", icon: Users });
    }
  }
  if (can("reports.build")) {
    links.push({ href: "/reports", label: "Raporlar", icon: BarChart3 });
  }

  return (
    <AppHeader
      context={companyName ?? (isProxy ? "Firma seçilmedi" : undefined)}
      links={links}
      current={current}
      userLabel={userName}
      right={
        <>
          {isProxy && (
            <CompanySwitcher
              currentCompanyId={companyId ?? null}
              currentCompanyName={companyName}
            />
          )}
          {right}
        </>
      }
    />
  );
}
