import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasRole, defaultRouteForRole } from "@repo/auth/rbac";
import { BusinessError, type BusinessErrorCode } from "@repo/services";
import type { Role, SessionUser } from "@repo/types";

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

/**
 * Server-side guard for route handlers / server actions.
 * Throws AuthError(401) if unauthenticated, AuthError(403) if role not allowed.
 * Returns the typed session user on success.
 */
export async function requireUser(allowed?: readonly Role[]): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;
  if (!user) throw new AuthError(401, "Giriş gerekli");

  if (allowed && !hasRole(user.role, allowed)) {
    throw new AuthError(403, "Yetkisiz erişim");
  }

  return {
    id: user.id,
    email: user.email ?? "",
    name: user.name ?? "",
    role: user.role,
    companyId: user.companyId,
  };
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
