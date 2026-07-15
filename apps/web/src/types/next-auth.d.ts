import type { Role } from "@repo/types";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: Role;
    companyId: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      companyId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    companyId: string | null;
  }
}
