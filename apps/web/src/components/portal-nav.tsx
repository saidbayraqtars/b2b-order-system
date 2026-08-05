import type { ReactNode } from "react";
import {
  BarChart3,
  CheckSquare,
  ClipboardList,
  Receipt,
  ShoppingBag,
  Users,
} from "lucide-react";
import type { Role } from "@repo/types";
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
  companyName,
  userName,
  current,
  right,
  isProxy = false,
  companyId,
}: {
  role: Role;
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

  const links: NavLink[] = [
    { href: `/portal${q}`, label: "Katalog", icon: ShoppingBag },
    { href: `/portal/orders${q}`, label: "Siparişler", icon: ClipboardList },
    { href: `/portal/statement${q}`, label: "Ekstre", icon: Receipt },
  ];

  if (!isProxy && role === "COMPANY_ADMIN") {
    links.push(
      { href: "/portal/approvals", label: "Onaylar", icon: CheckSquare },
      { href: "/portal/users", label: "Kullanıcılar", icon: Users },
    );
  }
  if (role === "COMPANY_ADMIN" || role === "SUPER_ADMIN" || role === "SALES_REP") {
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
