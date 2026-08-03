import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { hasRole, defaultRouteForRole } from "@repo/auth/rbac";
import { BusinessError, type BusinessErrorCode } from "@repo/services";
import type { Role, SessionUser } from "@repo/types";
import { verifyMobileToken } from "./mobile-token";

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** 400 — malformed / missing request input (failed Zod parse, missing param). */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

/** Read + verify a mobile bearer token from the Authorization header, if present. */
async function bearerUser(): Promise<SessionUser | null> {
  const authorization = headers().get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return verifyMobileToken(authorization.slice("Bearer ".length).trim());
}

/**
 * Server-side guard for route handlers / server actions.
 * Accepts either a mobile bearer token (Authorization header) or an Auth.js
 * cookie session — so the same endpoints serve the web portal and the app.
 * Throws AuthError(401) if unauthenticated, AuthError(403) if role not allowed.
 * Returns the typed session user on success.
 */
export async function requireUser(allowed?: readonly Role[]): Promise<SessionUser> {
  let user = await bearerUser();

  if (!user) {
    const session = await auth();
    const s = session?.user;
    if (s) {
      user = {
        id: s.id,
        email: s.email ?? "",
        name: s.name ?? "",
        role: s.role,
        companyId: s.companyId,
      };
    }
  }

  if (!user) throw new AuthError(401, "Giriş gerekli");

  if (allowed && !hasRole(user.role, allowed)) {
    throw new AuthError(403, "Yetkisiz erişim");
  }

  return user;
}

/**
 * Page-level guard for Server Components. Unlike requireUser (which throws for
 * route handlers), this redirects: unauthenticated → /login, wrong role → the
 * caller's own default landing route. Returns the session user on success.
 */
export async function requirePage(
  allowed: readonly Role[],
): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (!hasRole(user.role, allowed)) redirect(defaultRouteForRole(user.role));
  return {
    id: user.id,
    email: user.email ?? "",
    name: user.name ?? "",
    role: user.role,
    companyId: user.companyId,
  };
}

/** HTTP status for each domain error code. */
const BUSINESS_STATUS: Record<BusinessErrorCode, number> = {
  NO_PRICE: 409,
  VARIANT_NOT_FOUND: 404,
  COMPANY_NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  MOQ_NOT_MET: 422,
  NOT_CASE_MULTIPLE: 422,
  INSUFFICIENT_STOCK: 409,
  EMPTY_ORDER: 422,
  FORBIDDEN_APPROVAL: 403,
  INVALID_STATE: 409,
  CHECKIN_NOT_FOUND: 404,
  FORBIDDEN: 403,
  // catalog administration
  PRODUCT_NOT_FOUND: 404,
  CATEGORY_NOT_FOUND: 404,
  PRICE_NOT_FOUND: 404,
  DISCOUNT_NOT_FOUND: 404,
  GROUP_NOT_FOUND: 404,
  DUPLICATE_SKU: 409,
  DUPLICATE_BARCODE: 409,
  DUPLICATE_PRICE_TIER: 409,
  CATEGORY_HAS_CHILDREN: 409,
  CATEGORY_IN_USE: 409,
  IN_USE: 409,
  INVALID_DISCOUNT_TARGET: 422,
  CATEGORY_CYCLE: 422,
  // user-defined reports
  REPORT_NOT_FOUND: 404,
  INVALID_REPORT: 422,
  // company / user administration
  USER_NOT_FOUND: 404,
  ADDRESS_NOT_FOUND: 404,
  DUPLICATE_EMAIL: 409,
  DUPLICATE_TAX_NUMBER: 409,
  DUPLICATE_GROUP: 409,
  INVALID_ROLE: 422,
  LAST_SUPER_ADMIN: 409,
  SELF_TARGET: 409,
};

/**
 * Wrap a route handler with error → JSON mapping.
 * AuthError → 401/403, BusinessError → typed 4xx with code, else 500.
 */
export function withAuthErrors(
  handler: () => Promise<Response>,
): Promise<Response> {
  return handler().catch((err) => {
    if (err instanceof AuthError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof InputError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof BusinessError) {
      return Response.json(
        { error: err.message, code: err.code, details: err.details },
        { status: BUSINESS_STATUS[err.code] },
      );
    }
    console.error(err);
    return Response.json({ error: "Sunucu hatası" }, { status: 500 });
  });
}
