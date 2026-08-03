import { SignJWT, jwtVerify } from "jose";
import { sessionUserSchema, type SessionUser } from "@repo/types";

// Bearer-token auth for the mobile app. The web uses Auth.js cookie sessions,
// but native clients can't ride cookies cleanly — so mobile logs in via
// /api/mobile/login and gets a signed JWT it sends as `Authorization: Bearer`.
// Signed with the same AUTH_SECRET (HS256) so no extra key management is needed.
//
// The token lives for 30 days, which is far too long to trust its claims: the
// account behind it may be demoted or switched off the day after it is issued.
// So it carries `v` (the account's tokenVersion at sign-in) and the guard
// compares that against the database on every request.

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-insecure-secret-change-me",
);

const ISSUER = "b2b-mobile";
const TTL = "30d";

export async function signMobileToken(
  user: SessionUser,
  tokenVersion: number,
): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
    v: tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secret);
}

export interface MobileClaims {
  user: SessionUser;
  /** tokenVersion at sign-in; 0 for tokens issued before versioning existed. */
  tokenVersion: number;
}

/** Verify a bearer token's signature and shape. Says nothing about whether the
 * account is still valid — that is checkPrincipal's job. */
export async function verifyMobileToken(
  token: string,
): Promise<MobileClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
    const parsed = sessionUserSchema.safeParse({
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      companyId: payload.companyId ?? null,
    });
    if (!parsed.success) return null;
    return {
      user: parsed.data,
      tokenVersion: typeof payload.v === "number" ? payload.v : 0,
    };
  } catch {
    return null;
  }
}
