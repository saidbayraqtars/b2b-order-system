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
  { prefix: "/portal", roles: ["COMPANY_ADMIN", "COMPANY_STAFF", "SUPER_ADMIN"] },
];

/** Roles allowed for a pathname, or null if the path is not gated. */
export function allowedRolesFor(pathname: string): readonly Role[] | null {
  const match = ROUTE_ACCESS.find((r) => pathname.startsWith(r.prefix));
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
    case "COMPANY_ADMIN":
    case "COMPANY_STAFF":
      return "/portal";
  }
}
