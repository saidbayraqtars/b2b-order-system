import type { Role } from "@repo/types";
import type { DefaultSession } from "next-auth";

// Mirror of packages/auth/src/next-auth.d.ts. Both exist because a .d.ts in
// another workspace package is not pulled into this app's compilation — keep
// them identical.
//
// `tokenVersion` is the account's session generation at login. It is a claim,
// not an authority: the server-side guard compares it against the database on
// every request and re-reads role/companyId from there.
declare module "next-auth" {
  interface User {
    role: Role;
    companyId: string | null;
    tokenVersion?: number;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      companyId: string | null;
      tokenVersion: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    companyId: string | null;
    tokenVersion: number;
  }
}
