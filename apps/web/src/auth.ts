import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@repo/auth/config";
import { attemptLogin } from "@repo/services";
import { loginSchema } from "@repo/types";
import { requestMetaFrom } from "@/lib/request-meta";

// Node-runtime Auth.js instance: full config + Credentials provider.
// Credential checking, the brute-force counter and the audit entries all live
// in attemptLogin so the web form and the mobile endpoint cannot drift apart.
export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-posta", type: "email" },
        password: { label: "Şifre", type: "password" },
      },
      authorize: async (raw, request) => {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const result = await attemptLogin(
          email,
          password,
          requestMetaFrom(request as Request | undefined, "web"),
        );
        // Auth.js has no channel for a reason code here, so every failure looks
        // the same to the form. The audit trail keeps the distinction.
        if (!result.ok) return null;

        return { ...result.user, tokenVersion: result.tokenVersion };
      },
    }),
  ],
});
