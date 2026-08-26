import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@repo/auth/config";
import { attemptLogin } from "@repo/services";
import { loginSchema } from "@repo/types";
import { requestMetaFrom } from "@/lib/request-meta";

/**
 * Girişin ikinci adım istediğini forma bildiren hata.
 *
 * Auth.js'in `authorize`'ından çağırana tek bir kanal gider: `CredentialsSignin`
 * üzerindeki `code`, yönlendirme adresinde `?code=` olarak görünür ve
 * `signIn(..., { redirect: false })` onu `res.code` diye geri verir.
 *
 * Buraya **yalnızca ikinci adımın gerekip gerekmediği** yazılır. Şifre yanlış
 * mı, e-posta kayıtlı mı, hesap pasif mi — hiçbiri buradan geçmez; hepsi aynı
 * genel mesaja düşer ve ayrım denetim kaydında kalır.
 */
class TotpRequired extends CredentialsSignin {
  override code = "TOTP_REQUIRED";
}

/** Kod geldi ama tutmadı — form kod alanını açık tutup mesajı değiştirsin. */
class TotpInvalid extends CredentialsSignin {
  override code = "TOTP_INVALID";
}

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
        totp: { label: "Doğrulama kodu", type: "text" },
      },
      authorize: async (raw, request) => {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password, totp } = parsed.data;
        const result = await attemptLogin(
          email,
          password,
          requestMetaFrom(request as Request | undefined, "web"),
          totp,
        );

        if (!result.ok) {
          // İkinci adım tek istisna: forma "kodu sor" demek zorundayız, yoksa
          // 2FA açık bir kullanıcı hiçbir zaman giremez. Kalan bütün sebepler
          // (hatalı şifre, bilinmeyen e-posta, pasif hesap, kilit) forma aynı
          // görünür — ayrım denetim kaydında duruyor.
          if (result.reason === "TOTP_REQUIRED") throw new TotpRequired();
          if (result.reason === "TOTP_INVALID") throw new TotpInvalid();
          return null;
        }

        return { ...result.user, tokenVersion: result.tokenVersion };
      },
    }),
  ],
});
