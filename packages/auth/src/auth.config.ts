import type { NextAuthConfig } from "next-auth";
import type { Role } from "@repo/types";

/**
 * Edge-safe Auth.js config: NO providers, NO Prisma/bcrypt imports.
 * Safe to import inside Next.js middleware (edge runtime).
 * The Credentials provider is added in the Node-runtime instance (apps/web/src/auth.ts).
 */
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // Propagate role + companyId + tokenVersion into the JWT on sign-in.
    // These are a snapshot of the account at that moment; they are never
    // refreshed here, which is exactly why the server-side guard re-reads the
    // account on every request instead of believing them.
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.companyId = user.companyId ?? null;
        token.tokenVersion = user.tokenVersion ?? 0;
      }
      return token;
    },
    // Expose them on the session for server/client consumers.
    // token.role / token.companyId come from the JWT index signature (unknown),
    // so we cast — the values are set by the jwt() callback above.
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? session.user.id;
        session.user.role = token.role as Role;
        session.user.companyId = (token.companyId as string | null) ?? null;
        session.user.tokenVersion = (token.tokenVersion as number | undefined) ?? 0;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
