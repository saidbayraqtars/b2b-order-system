import type { Role } from "@repo/types";

// Edge-safe RBAC. No Prisma import here (used inside Next.js middleware / edge runtime).

/**
 * Route-prefix → allowed roles for PAGE routes (used by middleware to redirect).
 * First matching prefix wins. Anything not listed is treated as public here.
 *
 * NOTE: `/api/*` routes are deliberately NOT listed. They are guarded server-side
 * via requireUser() so they return JSON 401/403 instead of an HTML redirect
 * (correct for the mobile app and any API client).
 */
const ROUTE_ACCESS: ReadonlyArray<{ prefix: string; roles: readonly Role[] }> = [
  { prefix: "/admin", roles: ["SUPER_ADMIN"] },
  { prefix: "/rep", roles: ["SALES_REP", "SUPER_ADMIN"] },
  // Kurye masası. Süper admin de girer (kuryenin gördüğünü görmeden sorun
  // çözülemiyor); listeyi servis kendi sevkiyatlarıyla sınırlar.
  { prefix: "/kurye", roles: ["COURIER", "SUPER_ADMIN"] },
  // Plasiyer ve süper admin de buraya girer: müşteri adına sipariş girmek
  // (telefonla gelen sipariş, saha ziyareti) toptan işin normal akışı. Hangi
  // firma adına çalışıldığı ?companyId ile taşınır ve her istekte
  // resolveCompanyId tarafından yetkilendirilir — plasiyer yalnızca kendi
  // portföyünü, süper admin herkesi görür.
  {
    prefix: "/portal",
    roles: ["COMPANY_ADMIN", "COMPANY_STAFF", "SALES_REP", "SUPER_ADMIN"],
  },
  // Report designer. Company staff are order-entry only; everyone else builds
  // reports, and the engine scopes each one's rows to what they may already see.
  { prefix: "/reports", roles: ["SUPER_ADMIN", "SALES_REP", "COMPANY_ADMIN"] },
  // Order detail is one page for every persona; the data itself is scoped
  // server-side (own company / rep portfolio / any for super admin).
  {
    prefix: "/orders",
    roles: ["COMPANY_ADMIN", "COMPANY_STAFF", "SALES_REP", "SUPER_ADMIN"],
  },
  // Own account. Listed so an anonymous visitor is sent to /login rather than
  // treated as public; every authenticated role owns an account.
  {
    prefix: "/hesabim",
    roles: [
      "COMPANY_ADMIN",
      "COMPANY_STAFF",
      "SALES_REP",
      "SUPER_ADMIN",
      "COURIER",
    ],
  },
  // Printable waybills and invoices. Same shape as /orders: one page per role,
  // and the document itself is authorized against its company server-side.
  {
    prefix: "/documents",
    roles: [
      "COMPANY_ADMIN",
      "COMPANY_STAFF",
      "SALES_REP",
      "SUPER_ADMIN",
      "COURIER",
    ],
  },
];

/**
 * Roles allowed for a pathname, or null if the path is not gated.
 *
 * The prefix has to end on a path boundary. Plain `startsWith` looked right and
 * was not: `/reports` starts with `/rep`, so the report designer was being
 * gated by the sales-rep rule and every company admin bounced to /403 — a page
 * their own role list allows. A prefix only matches the whole segment.
 */
export function allowedRolesFor(pathname: string): readonly Role[] | null {
  const match = ROUTE_ACCESS.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  return match ? match.roles : null;
}

/** True if `role` may access `pathname`. Ungated paths return true. */
export function canAccess(pathname: string, role: Role | undefined | null): boolean {
  const allowed = allowedRolesFor(pathname);
  if (!allowed) return true;
  if (!role) return false;
  return allowed.includes(role);
}

/** Simple allow-list check for server actions / route handlers. */
export function hasRole(role: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(role);
}

export function isSuperAdmin(role: Role | undefined | null): boolean {
  return role === "SUPER_ADMIN";
}

/** Landing route for a role after login. */
export function defaultRouteForRole(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/admin";
    case "SALES_REP":
      return "/rep";
    case "COURIER":
      return "/kurye";
    case "COMPANY_ADMIN":
    case "COMPANY_STAFF":
      return "/portal";
  }
}
