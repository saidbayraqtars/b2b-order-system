import { BarChart3, LayoutDashboard, ShoppingBag } from "lucide-react";
import { requirePage } from "@/lib/guard";
import { AppHeader, type NavLink } from "@/components/app-shell";
import { RepDashboard } from "./_components/rep-dashboard";

const LINKS: NavLink[] = [
  { href: "/rep", label: "Panel", icon: LayoutDashboard },
  { href: "/portal", label: "Sipariş gir", icon: ShoppingBag },
  { href: "/reports", label: "Raporlarım", icon: BarChart3 },
];

export default async function RepDashboardPage() {
  // requirePage, not requireUser: a wrong-role visitor belongs on their own
  // landing route, not on a thrown 403 in the middle of an HTML response.
  const user = await requirePage(["SALES_REP", "SUPER_ADMIN"]);

  return (
    <div>
      <AppHeader
        context="Plasiyer Paneli"
        links={LINKS}
        current="/rep"
        userLabel={user.name}
      />
      <div className="mx-auto max-w-5xl px-4 pb-6">
        <RepDashboard />
      </div>
    </div>
  );
}
