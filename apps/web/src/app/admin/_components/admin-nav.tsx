import {
  Activity,
  BarChart3,
  Building2,
  CalendarClock,
  FileText,
  Landmark,
  LayoutDashboard,
  Layers,
  Megaphone,
  Package,
  Percent,
  ShieldCheck,
  Tags,
  TrendingUp,
  Users,
  Wallet,
  Wand2,
} from "lucide-react";
import { AppHeader, type NavLink } from "@/components/app-shell";

const LINKS: NavLink[] = [
  { href: "/admin", label: "Panel", icon: LayoutDashboard },
  { href: "/admin/organization", label: "Kuruluş", icon: Landmark },
  { href: "/admin/companies", label: "Firmalar", icon: Building2 },
  { href: "/admin/users", label: "Kullanıcılar", icon: Users },
  { href: "/admin/products", label: "Ürünler", icon: Package },
  { href: "/admin/categories", label: "Kategoriler", icon: Tags },
  { href: "/admin/customer-groups", label: "Gruplar", icon: Layers },
  { href: "/admin/promotions", label: "Kampanyalar", icon: Percent },
  { href: "/admin/kasa", label: "Kasa", icon: Wallet },
  { href: "/admin/payment-terms", label: "Vadeler", icon: CalendarClock },
  { href: "/admin/volume-tiers", label: "Hacim", icon: TrendingUp },
  { href: "/admin/announcements", label: "Duyurular", icon: Megaphone },
  { href: "/admin/documents", label: "Belgeler", icon: FileText },
  { href: "/admin/reports", label: "Raporlar", icon: BarChart3 },
  { href: "/reports", label: "Tasarımcı", icon: Wand2 },
  { href: "/admin/activity", label: "Hareketler", icon: Activity },
  { href: "/admin/audit", label: "Güvenlik", icon: ShieldCheck },
];

/** Shared header for every admin screen. */
export function AdminNav({
  email,
  current,
}: {
  email: string;
  current: (typeof LINKS)[number]["href"];
}) {
  return (
    <AppHeader
      context="Yönetim Paneli"
      links={LINKS}
      current={current}
      userLabel={email}
    />
  );
}
