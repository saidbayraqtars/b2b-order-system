import type { Role } from "@repo/types";
import type { DefaultSession } from "next-auth";

// Augment Auth.js types so role + companyId are strongly typed everywhere.
//
// `tokenVersion` rides along so a server-side guard can compare the session
// against the live account. The claims here describe the account as it was at
// login — authorisation decisions must use the freshly loaded row instead.
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
