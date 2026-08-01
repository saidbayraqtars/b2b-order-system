import { SignJWT, jwtVerify } from "jose";
import { sessionUserSchema, type SessionUser } from "@repo/types";

// Bearer-token auth for the mobile app. The web uses Auth.js cookie sessions,
// but native clients can't ride cookies cleanly — so mobile logs in via
// /api/mobile/login and gets a signed JWT it sends as `Authorization: Bearer`.
// Signed with the same AUTH_SECRET (HS256) so no extra key management is needed.

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-insecure-secret-change-me",
);

const ISSUER = "b2b-mobile";
const TTL = "30d";

export async function signMobileToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secret);
}

/** Verify a bearer token and return the principal, or null if invalid/expired. */
export async function verifyMobileToken(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
    const parsed = sessionUserSchema.safeParse({
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      companyId: payload.companyId ?? null,
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
