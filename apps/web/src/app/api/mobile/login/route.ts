import type { NextRequest } from "next/server";
import { attemptLogin, getDisabledModules, LOCKOUT_MINUTES } from "@repo/services";
import { effectivePermissions, loginSchema } from "@repo/types";
import { AuthError, InputError, withAuthErrors } from "@/lib/guard";
import { signMobileToken } from "@/lib/mobile-token";
import { requestMetaFrom } from "@/lib/request-meta";

// POST /api/mobile/login — email/password → bearer token for the native app.
export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const json = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    const { email, password, totp } = parsed.data;
    const result = await attemptLogin(
      email,
      password,
      requestMetaFrom(req, "mobile"),
      totp,
    );

    if (!result.ok) {
      // İkinci adım kendi kodunu taşır: uygulama şifre ekranını bozmadan kod
      // ekranına geçebilsin. Web'deki `TOTP_REQUIRED` ile aynı sözcük —
      // iki kanalın sözlüğü ayrışırsa mobil taraf sessizce yanlış ekranı açar.
      if (result.reason === "TOTP_REQUIRED") {
        throw new AuthError(
          401,
          "Doğrulama kodu gerekli",
          "TOTP_REQUIRED",
        );
      }
      if (result.reason === "TOTP_INVALID") {
        throw new AuthError(
          401,
          "Doğrulama kodu hatalı veya süresi geçmiş",
          "TOTP_INVALID",
        );
      }
      // A locked account is told so — waiting is the fix, and only a real
      // account can lock. Wrong password and unknown e-mail stay identical.
      throw new AuthError(
        401,
        result.reason === "LOCKED"
          ? `Çok fazla hatalı deneme — hesap ${LOCKOUT_MINUTES} dakika kilitlendi`
          : "E-posta veya şifre hatalı",
        result.reason === "LOCKED" ? "ACCOUNT_DISABLED" : "NO_SESSION",
      );
    }

    const token = await signMobileToken(result.user, result.tokenVersion);
    // Uygulama gezinmesini bu listeden kuruyor: kapalı modülün ekranı ilk
    // açılışta da görünmesin. (/api/mobile/me zaten etkin listeyi dönüyor.)
    const user = {
      ...result.user,
      permissions: effectivePermissions(result.user.permissions, await getDisabledModules()),
    };
    return Response.json({ token, user });
  });
}
