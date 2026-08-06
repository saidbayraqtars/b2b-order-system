import { authenticateAgent, type AuthenticatedAgent } from "@repo/services";
import { AuthError } from "./guard";

// ERP ajanının kapısı — kullanıcı oturumundan tamamen ayrı.
//
// The agent is a process, not a person. It never gets a cookie session, it is
// never a `User`, and it can never reach a route that expects one: `requireUser`
// and `requireAgent` read different credentials and share no fallback. That
// separation is the point. A single "is this request allowed" helper that
// accepted either would eventually let an agent token through somewhere it was
// never meant to go.

/** Bearer token off the Authorization header. Nothing else is accepted. */
function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token || null;
}

/**
 * The address the request came from, for the agent's last-seen record.
 *
 * Same caveat as everywhere else this header is read: it is only as trustworthy
 * as the proxy in front, so it is recorded and never used to decide anything.
 */
function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

/** Resolve the agent behind this request, or refuse it with 401. */
export async function requireAgent(req: Request): Promise<AuthenticatedAgent> {
  const agent = await authenticateAgent(bearerToken(req), { ip: clientIp(req) });
  if (!agent) {
    // One answer for missing, malformed, unknown and disabled. Telling a caller
    // which of those it was tells whoever holds a revoked token that it used to
    // work.
    throw new AuthError(401, "Yetkisiz");
  }
  return agent;
}
