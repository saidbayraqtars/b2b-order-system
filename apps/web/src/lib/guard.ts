import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { hasRole, defaultRouteForRole } from "@repo/auth/rbac";
import {
  BusinessError,
  checkPrincipal,
  recordAudit,
  type BusinessErrorCode,
  type PrincipalRejection,
} from "@repo/services";
import type { Role, SessionUser } from "@repo/types";
import { verifyMobileToken } from "./mobile-token";
import { requestMeta } from "./request-meta";

/** Machine-readable reason for a 401, so a client knows to drop its token. */
export type AuthErrorCode =
  | "NO_SESSION"
  | "SESSION_REVOKED"
  | "ACCOUNT_DISABLED"
  | "ACCOUNT_MISSING"
  | "FORBIDDEN";

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
    public readonly code: AuthErrorCode = "NO_SESSION",
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

interface SessionClaim {
  user: SessionUser;
  tokenVersion: number;
  channel: "web" | "mobile";
}

/** Read whatever credential the request carries. Verifies the signature only. */
async function readClaim(): Promise<SessionClaim | null> {
  const authorization = headers().get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const claims = await verifyMobileToken(
      authorization.slice("Bearer ".length).trim(),
    );
    return claims
      ? { user: claims.user, tokenVersion: claims.tokenVersion, channel: "mobile" }
      : null;
  }

  const session = await auth();
  const s = session?.user;
  if (!s) return null;
  return {
    user: {
      id: s.id,
      email: s.email ?? "",
      name: s.name ?? "",
      role: s.role,
      companyId: s.companyId,
    },
    tokenVersion: s.tokenVersion ?? 0,
    channel: "web",
  };
}

const REJECTION_MESSAGE: Record<PrincipalRejection, string> = {
  UNKNOWN: "Hesabınız bulunamadı, yeniden giriş yapın",
  DISABLED: "Hesabınız pasife alınmış",
  STALE: "Yetkileriniz değişti, yeniden giriş yapın",
};

const REJECTION_CODE: Record<PrincipalRejection, AuthErrorCode> = {
  UNKNOWN: "ACCOUNT_MISSING",
  DISABLED: "ACCOUNT_DISABLED",
  STALE: "SESSION_REVOKED",
};

/**
 * Resolve the caller to a *live* account.
 *
 * The session token proves someone logged in once. It does not prove the
 * account still exists, is still enabled, or still has the role it had then —
 * a cookie lasts weeks and a mobile token 30 days. So every request re-reads
 * the row and compares tokenVersion; the returned role and companyId come from
 * the database, never from the token.
 *
 * Wrapped in React's `cache` so several guarded calls inside one request share
 * a single query.
 */
const resolvePrincipal = cache(async (): Promise<
  | { ok: true; user: SessionUser; channel: "web" | "mobile" }
  | { ok: false; rejection: PrincipalRejection | "NONE"; claim: SessionClaim | null }
> => {
  const claim = await readClaim();
  if (!claim) return { ok: false, rejection: "NONE", claim: null };

  const { user, rejection } = await checkPrincipal(claim.user.id, claim.tokenVersion);
  if (rejection) return { ok: false, rejection, claim };

  return {
    ok: true,
    channel: claim.channel,
    user: {
      id: user!.id,
      email: user!.email,
      name: user!.name,
      role: user!.role,
      companyId: user!.companyId,
    },
  };
});

async function rejectPrincipal(
  rejection: PrincipalRejection,
  claim: SessionClaim,
): Promise<never> {
  // Worth logging: a revoked session still being used is either a user whose
  // privileges just changed, or a token that outlived the account it named.
  const meta = requestMeta(claim.channel);
  await recordAudit({
    actor: { id: claim.user.id, email: claim.user.email, role: claim.user.role },
    action: "SESSION_REVOKED",
    summary: `Geçersiz oturum reddedildi (${rejection})`,
    entity: "User",
    entityId: claim.user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { rejection, channel: claim.channel },
  });
  throw new AuthError(
    401,
    REJECTION_MESSAGE[rejection],
    REJECTION_CODE[rejection],
  );
}

/**
 * Server-side guard for route handlers / server actions.
 * Accepts either a mobile bearer token (Authorization header) or an Auth.js
 * cookie session — so the same endpoints serve the web portal and the app.
 * Throws AuthError(401) if unauthenticated/revoked, AuthError(403) if the
 * account's *current* role is not allowed. Returns the live session user.
 */
export async function requireUser(allowed?: readonly Role[]): Promise<SessionUser> {
  const result = await resolvePrincipal();

  if (!result.ok) {
    if (result.rejection === "NONE" || !result.claim) {
      throw new AuthError(401, "Giriş gerekli", "NO_SESSION");
    }
    return rejectPrincipal(result.rejection, result.claim);
  }

  if (allowed && !hasRole(result.user.role, allowed)) {
    const meta = requestMeta(result.channel);
    await recordAudit({
      actor: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
      },
      action: "ACCESS_DENIED",
      summary: `Yetkisiz istek: ${headers().get("x-pathname") ?? "bilinmeyen uç"}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { required: allowed, actual: result.user.role },
    });
    throw new AuthError(403, "Yetkisiz erişim", "FORBIDDEN");
  }

  return result.user;
}

/**
 * Page-level guard for Server Components. Unlike requireUser (which throws for
 * route handlers), this redirects: no/dead session → /login, wrong role → the
 * caller's own default landing route. The same live-account check applies, so
 * an open browser tab loses access the moment the account is changed.
 */
export async function requirePage(allowed: readonly Role[]): Promise<SessionUser> {
  const result = await resolvePrincipal();

  if (!result.ok) {
    if (result.rejection === "NONE" || !result.claim) redirect("/login");
    // A stale cookie would otherwise bounce between /login and the page it
    // guards, because middleware still sees a syntactically valid session.
    redirect(`/login?reason=${REJECTION_CODE[result.rejection]}`);
  }

  if (!hasRole(result.user.role, allowed)) {
    redirect(defaultRouteForRole(result.user.role));
  }
  return result.user;
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
  // account self-service
  INVALID_PASSWORD: 403,
  // promotions
  PROMOTION_NOT_FOUND: 404,
  INVALID_PROMOTION: 422,
  DUPLICATE_PROMOTION_CODE: 409,
  COUPON_INVALID: 422,
  // documents
  DOCUMENT_SERIES_MISSING: 409,
  EXTERNAL_NUMBER_REQUIRED: 422,
  SERIES_NOT_FOUND: 404,
  DUPLICATE_SERIES: 409,
  INVALID_SERIES_COUNTER: 422,
  SHIPMENT_NOT_FOUND: 404,
  ORDER_ITEM_NOT_FOUND: 404,
  EMPTY_SHIPMENT: 422,
  OVER_SHIPMENT: 422,
  INVOICE_NOT_FOUND: 404,
  NOTHING_TO_INVOICE: 409,
  OVER_INVOICE: 422,
  ALREADY_INVOICED: 409,
  // password reset
  RESET_TOKEN_INVALID: 422,
  // uploads
  INVALID_UPLOAD: 422,
  // storefront
  ANNOUNCEMENT_NOT_FOUND: 404,
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
      return Response.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
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
