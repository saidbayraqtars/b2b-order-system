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
    // Propagate role + companyId into the JWT on sign-in.
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.companyId = user.companyId ?? null;
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
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
