"use client";

import type { ReactNode } from "react";
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
  Plug,
  ShieldCheck,
  Sticker,
  Tags,
  Target,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  ScrollText,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { hasPermission, type Permission } from "@repo/types";
import { SidebarShell, type SidebarGroup } from "@/components/app-sidebar";

interface AdminLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Bu bölümü açan izin. Yoksa herkese görünür (yalnızca panel). */
  permission?: Permission;
}

/**
 * Yönetim panelinin bölümleri, işe göre gruplanmış.
 *
 * Her satır kendi iznini taşır ve menü buna göre süzülür — ama süzgeç yalnızca
 * görgüseldir: ekranın kendisi `requirePage(..., "izin")` ile ayrıca kapalıdır.
 * Menüden gizlemek bir güvenlik önlemi değil, adres çubuğuna yazan biri için
 * hiçbir şey ifade etmez.
 */
const GROUPS: ReadonlyArray<{ title: string; links: readonly AdminLink[] }> = [
  {
    title: "Genel",
    links: [{ href: "/admin", label: "Panel", icon: LayoutDashboard }],
  },
  {
    title: "Katalog",
    links: [
      { href: "/admin/products", label: "Ürünler", icon: Package, permission: "products.view" },
      { href: "/admin/categories", label: "Kategoriler", icon: Tags, permission: "products.view" },
      { href: "/admin/promotions", label: "Kampanyalar", icon: Percent, permission: "promotions.manage" },
    ],
  },
  {
    title: "Müşteriler",
    links: [
      { href: "/admin/companies", label: "Firmalar", icon: Building2, permission: "companies.view" },
      { href: "/admin/users", label: "Kullanıcılar", icon: Users, permission: "users.manage" },
      { href: "/admin/customer-groups", label: "Gruplar", icon: Layers, permission: "companies.view" },
    ],
  },
  {
    title: "Saha & Dağıtım",
    links: [
      { href: "/admin/targets", label: "Hedefler", icon: Target, permission: "targets.manage" },
      { href: "/admin/deliveries", label: "Dağıtım", icon: Truck, permission: "orders.fulfil" },
    ],
  },
  {
    title: "Finans",
    links: [
      { href: "/admin/kasa", label: "Kasa & Banka", icon: Wallet, permission: "cash.view" },
      { href: "/admin/cekler", label: "Çek & senet", icon: ScrollText, permission: "cheques.manage" },
      { href: "/admin/payment-terms", label: "Vadeler", icon: CalendarClock, permission: "payment_terms.manage" },
      { href: "/admin/volume-tiers", label: "Hacim iskontosu", icon: TrendingUp, permission: "volume_tiers.manage" },
    ],
  },
  {
    title: "Belge & Rapor",
    links: [
      { href: "/admin/documents", label: "Belgeler", icon: FileText, permission: "documents.view" },
      { href: "/admin/labels", label: "Etiket & fiş", icon: Sticker, permission: "labels.manage" },
      { href: "/admin/reports", label: "Raporlar", icon: BarChart3, permission: "reports.view" },
      { href: "/reports", label: "Rapor tasarımcısı", icon: Wand2, permission: "reports.build" },
    ],
  },
  {
    title: "Sistem",
    links: [
      { href: "/admin/organization", label: "Kuruluş", icon: Landmark, permission: "organization.manage" },
      { href: "/admin/erp", label: "ERP köprüsü", icon: Plug, permission: "erp.manage" },
      { href: "/admin/announcements", label: "Duyurular", icon: Megaphone, permission: "announcements.manage" },
      { href: "/admin/activity", label: "Hareketler", icon: Activity, permission: "activity.view" },
      { href: "/admin/audit", label: "Güvenlik", icon: ShieldCheck, permission: "audit.view" },
    ],
  },
];

/** Yetkisi olmayan bölümleri ve tümüyle boşalan grupları atar. */
function visibleGroups(permissions: readonly Permission[]): SidebarGroup[] {
  return GROUPS.map((g) => ({
    title: g.title,
    links: g.links.filter((l) => !l.permission || hasPermission(permissions, l.permission)),
  })).filter((g) => g.links.length > 0);
}

export function AdminShell({
  email,
  permissions,
  children,
}: {
  email: string;
  permissions: readonly Permission[];
  children: ReactNode;
}) {
  return (
    <SidebarShell
      context="Yönetim Paneli"
      groups={visibleGroups(permissions)}
      userLabel={email}
    >
      {children}
    </SidebarShell>
  );
}
