import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@repo/auth/config";
import { canAccess, defaultRouteForRole } from "@repo/auth/rbac";

// Edge instance: authConfig has NO Credentials provider, so this stays edge-safe.
const { auth } = NextAuth(authConfig);

// This middleware is a fast pre-filter, not the access control.
// It runs on the edge and can only read the signed cookie — it cannot check
// whether the account still exists, is still enabled, or still has that role.
// The real decision is requireUser/requirePage in apps/web/src/lib/guard.ts,
// which re-reads the account from the database on every request.
export default auth((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
  const user = req.auth?.user;
  const isLoggedIn = Boolean(user);

  // Logged-in user hitting /login → send to their home. A revoked session is
  // an exception: it looks valid here, but the page guard will bounce them
  // straight back, so the ?reason= form of the login page must stay reachable.
  if (path === "/login" && isLoggedIn && user && !nextUrl.searchParams.has("reason")) {
    return NextResponse.redirect(new URL(defaultRouteForRole(user.role), nextUrl));
  }

  // Gate role-restricted areas.
  if (!canAccess(path, user?.role)) {
    if (!isLoggedIn) {
      const url = new URL("/login", nextUrl);
      url.searchParams.set("callbackUrl", path);
      return NextResponse.redirect(url);
    }
    // Logged in but wrong role → 403 page (or redirect to their home).
    return NextResponse.redirect(new URL("/403", nextUrl));
  }

  // Pass the path along so the audit trail can name the endpoint that was
  // refused. Request headers are rewritten, not response headers, so this is
  // only visible server-side.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", path);
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  // Run on everything except static assets & the auth API.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
