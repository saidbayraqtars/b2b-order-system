import { auth } from "@/auth";
import { hasRole } from "@repo/auth/rbac";
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

/** Wrap a route handler with error → JSON mapping. */
export function withAuthErrors(
  handler: () => Promise<Response>,
): Promise<Response> {
  return handler().catch((err) => {
    if (err instanceof AuthError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return Response.json({ error: "Sunucu hatası" }, { status: 500 });
  });
}
