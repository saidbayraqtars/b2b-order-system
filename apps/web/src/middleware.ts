import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@repo/auth/config";
import { canAccess, defaultRouteForRole } from "@repo/auth/rbac";

// Edge instance: authConfig has NO Credentials provider, so this stays edge-safe.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
  const user = req.auth?.user;
  const isLoggedIn = Boolean(user);

  // Logged-in user hitting /login → send to their home.
  if (path === "/login" && isLoggedIn && user) {
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

  return NextResponse.next();
});

export const config = {
  // Run on everything except static assets & the auth API.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
