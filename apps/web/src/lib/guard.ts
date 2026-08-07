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
import {
  hasPermission,
  PERMISSION_LABELS,
  type Permission,
  type Role,
  type SessionUser,
} from "@repo/types";
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
      // Boş: token'daki izin listesi hiçbir zaman okunmuyor, resolvePrincipal
      // aşağıda satırdan geleni koyuyor. Burada bir şey taşımak "cookie'de ne
      // yazıyorsa o" riskini bedava açardı.
      permissions: [],
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
      // Rol gibi: izinler de token'dan değil satırdan. Yetkisi az önce kısılan
      // bir kullanıcının açık sekmesi bir sonraki istekte bunu hisseder.
      permissions: user!.permissions,
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

/** Bir uç/ekranın istediği izin: tek anahtar ya da "hepsi gerekli" listesi. */
export type PermissionRequirement = Permission | readonly Permission[];

function missingPermissions(
  user: SessionUser,
  needed: PermissionRequirement | undefined,
): Permission[] {
  if (!needed) return [];
  const list = Array.isArray(needed) ? needed : [needed];
  return list.filter((p) => !hasPermission(user.permissions, p));
}

async function recordDenial(
  user: SessionUser,
  channel: "web" | "mobile",
  detail: Record<string, unknown>,
): Promise<void> {
  const meta = requestMeta(channel);
  await recordAudit({
    actor: { id: user.id, email: user.email, role: user.role },
    action: "ACCESS_DENIED",
    summary: `Yetkisiz istek: ${headers().get("x-pathname") ?? "bilinmeyen uç"}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: detail,
  });
}

/**
 * Server-side guard for route handlers / server actions.
 * Accepts either a mobile bearer token (Authorization header) or an Auth.js
 * cookie session — so the same endpoints serve the web portal and the app.
 * Throws AuthError(401) if unauthenticated/revoked, AuthError(403) if the
 * account's *current* role is not allowed. Returns the live session user.
 *
 * `needed` ikinci bir, daha ince kapı: rol bölüme girer, izin işi yapar. İkisi
 * ayrı tutuluyor çünkü aynı ucu iki rol farklı kapsamda kullanabiliyor
 * (kullanıcı yönetimi hem süper adminin hem firma yöneticisinin ucudur) —
 * kapsamı servis, yeteneği bu izin belirler.
 */
export async function requireUser(
  allowed?: readonly Role[],
  needed?: PermissionRequirement,
): Promise<SessionUser> {
  const result = await resolvePrincipal();

  if (!result.ok) {
    if (result.rejection === "NONE" || !result.claim) {
      throw new AuthError(401, "Giriş gerekli", "NO_SESSION");
    }
    return rejectPrincipal(result.rejection, result.claim);
  }

  if (allowed && !hasRole(result.user.role, allowed)) {
    await recordDenial(result.user, result.channel, {
      required: allowed,
      actual: result.user.role,
    });
    throw new AuthError(403, "Yetkisiz erişim", "FORBIDDEN");
  }

  const missing = missingPermissions(result.user, needed);
  if (missing.length > 0) {
    // Ayrı kaydediliyor: rol reddi yapılandırma hatasına, izin reddi çoğu zaman
    // birinin yetkisinin kısılmış olmasına işaret eder.
    await recordDenial(result.user, result.channel, {
      missingPermissions: missing,
      role: result.user.role,
    });
    throw new AuthError(
      403,
      `Bu işlem için yetkiniz yok (${missing.map((p) => PERMISSION_LABELS[p]).join(", ")})`,
      "FORBIDDEN",
    );
  }

  return result.user;
}

/**
 * "Şu izinlerden **en az biri**" kapısı.
 *
 * `requireUser(roles, [a, b])` hepsini ister; bazı ekranlar ise iki farklı
 * kişiye birden hizmet ediyor — teslimat listesini hem kurye (delivery.confirm)
 * hem sevkiyatı yöneten (orders.fulfil) görür ve kimsenin ikisine birden sahip
 * olması beklenmez. İki ayrı uç açmak, aynı listeyi iki yerde kopyalamak
 * demekti.
 *
 * Ret, izin reddi olarak kaydedilir — rol reddiyle karıştırılmasın.
 */
export async function requireAnyPermission(
  needed: readonly Permission[],
  allowed?: readonly Role[],
): Promise<SessionUser> {
  const user = await requireUser(allowed);
  if (needed.some((p) => hasPermission(user.permissions, p))) return user;

  await recordDenial(user, await requestChannel(), {
    missingPermissions: needed,
    anyOf: true,
    role: user.role,
  });
  throw new AuthError(403, "Yetkisiz erişim", "FORBIDDEN");
}

/**
 * Which application the current request came from, decided by the credential it
 * carried: a bearer token is the phone app, a cookie is a browser.
 *
 * Exposed so records that mean different things depending on where they were
 * written (a field visit, above all) can say so truthfully. A client-supplied
 * "source" field would be worth nothing — this one the caller cannot set.
 */
export async function requestChannel(): Promise<"web" | "mobile"> {
  const result = await resolvePrincipal();
  return result.ok ? result.channel : (result.claim?.channel ?? "web");
}

/**
 * Page-level guard for Server Components. Unlike requireUser (which throws for
 * route handlers), this redirects: no/dead session → /login, wrong role → the
 * caller's own default landing route. The same live-account check applies, so
 * an open browser tab loses access the moment the account is changed.
 */
export async function requirePage(
  allowed: readonly Role[],
  needed?: PermissionRequirement,
): Promise<SessionUser> {
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

  const missing = missingPermissions(result.user, needed);
  if (missing.length > 0) {
    await recordDenial(result.user, result.channel, {
      missingPermissions: missing,
      role: result.user.role,
    });
    // Bölüme girmeye hakkı var, bu ekrana yok: kendi bölümünün köküne değil,
    // "yetki yok" sayfasına gider — aksi hâlde menüden tıklayan kişi sessizce
    // panele geri atılır ve nedenini hiç öğrenmez.
    redirect(`/403?perm=${missing[0]}`);
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
  // field operations
  TRANSACTION_NOT_FOUND: 404,
  VISIT_ALREADY_OPEN: 409,
  // payment methods and terms
  //
  // 422, not 403: the caller is allowed to order, they picked a settlement this
  // customer was not offered. 403 would read as "you may not order at all" and
  // send the portal to the forbidden page instead of showing the message.
  PAYMENT_METHOD_NOT_ALLOWED: 422,
  PAYMENT_TERM_NOT_ALLOWED: 422,
  PAYMENT_TERM_NOT_FOUND: 404,
  PAYMENT_TERM_IN_USE: 409,
  PAYMENT_TERM_NAME_TAKEN: 409,
  // hacim iskontosu — all admin-side; a buyer never names a tier itself.
  VOLUME_TIER_NOT_FOUND: 404,
  VOLUME_TIER_IN_USE: 409,
  VOLUME_TIER_NAME_TAKEN: 409,
  // kasa & banka defteri
  CASH_ACCOUNT_NOT_FOUND: 404,
  CASH_ACCOUNT_NAME_TAKEN: 409,
  CASH_ACCOUNT_INACTIVE: 409,
  CASH_ACCOUNT_IN_USE: 409,
  LAST_CASH_ACCOUNT: 409,
  CASH_MOVEMENT_NOT_FOUND: 404,
  INVALID_AMOUNT: 422,
  // sanal POS / ödeme sağlayıcı
  //
  // 500, not 4xx: an unknown provider key is a typo in tenant.json, not
  // something the caller did. Answering 4xx would tell an operator their order
  // was wrong when the installation is.
  PAYMENT_PROVIDER_UNKNOWN: 500,
  PAYMENT_INTENT_NOT_FOUND: 404,
  PAYMENT_INSTALLMENT_NOT_ALLOWED: 422,
  // ERP köprüsü
  ERP_AGENT_NOT_FOUND: 404,
  ERP_AGENT_NAME_TAKEN: 409,
  ERP_RUN_NOT_FOUND: 404,
  // saha hedefleri
  TARGET_NOT_FOUND: 404,
  INVALID_TARGET: 422,
  // ziyaret çağrısı
  VISIT_REQUEST_NOT_FOUND: 404,
  COMPANY_INACTIVE: 409,
  // dağıtım
  //
  // 409, not 422: teslim edilmiş bir sevkiyatı yeniden teslim etmek geçersiz
  // bir girdi değil, geçersiz bir *durum* — iki kurye aynı işi aynı anda
  // kapatmaya çalıştığında ikincisi bunu görür.
  SHIPMENT_ALREADY_DELIVERED: 409,
  INVALID_COURIER: 422,
  // etiket / fiş şablonları
  LABEL_TEMPLATE_NOT_FOUND: 404,
  // depo & stok
  WAREHOUSE_NOT_FOUND: 404,
  INVALID_STOCK: 422,
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
