"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginSchema } from "@repo/types";
import {
  Button,
  ErrorLine,
  Label,
  TextInput,
  WarnLine,
} from "@/components/form";
import { Stagger } from "@/components/stagger";

/**
 * Why the page guard sent the user back here. A session can die between two
 * clicks — the account is deactivated, demoted or has its password reset — and
 * without this the user just sees the login form again with no explanation.
 */
const REASONS: Record<string, string> = {
  SESSION_REVOKED: "Yetkileriniz değişti. Lütfen yeniden giriş yapın.",
  ACCOUNT_DISABLED: "Hesabınız pasife alınmış. Yöneticinizle görüşün.",
  ACCOUNT_MISSING: "Hesabınız bulunamadı. Yöneticinizle görüşün.",
};

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";
  const reason = REASONS[params.get("reason") ?? ""];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  /**
   * Kod alanı baştan görünmez. Hesapların çoğunda ikinci adım yok; herkese
   * boş bir kod kutusu göstermek "acaba bende de mi olmalı" sorusu doğurur.
   * Sunucu `TOTP_REQUIRED` dediğinde açılır — o an şifrenin doğru olduğu da
   * bilinir, yani kutu tam gerektiği anda çıkar.
   */
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({
      email,
      password,
      ...(totp.trim() ? { totp: totp.trim() } : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Geçersiz giriş");
      return;
    }

    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      totp: totp.trim(),
      redirect: false,
    });
    setLoading(false);

    if (res?.error) {
      if (res.code === "TOTP_REQUIRED") {
        setNeedsTotp(true);
        setError(null);
        return;
      }
      if (res.code === "TOTP_INVALID") {
        setNeedsTotp(true);
        setTotp("");
        setError("Doğrulama kodu hatalı veya süresi geçmiş");
        return;
      }
      // Şifre değişmiş olabilir; kod alanı açıksa kapatıp baştan başlat.
      setNeedsTotp(false);
      setTotp("");
      setError("E-posta veya şifre hatalı");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {reason && <WarnLine>{reason}</WarnLine>}
      <Stagger index={0}>
        <Label htmlFor="email">E-posta</Label>
        <TextInput
          id="email"
          type="email"
          placeholder="ad@firma.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
        />
      </Stagger>
      <Stagger index={1}>
        <Label htmlFor="password">Şifre</Label>
        <TextInput
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </Stagger>
      {needsTotp && (
        // Gecikmesiz beliriyor: bu alan sayfa açılırken değil, kullanıcı
        // gönderdikten sonra çıkıyor. Sıraya sokulmuş bir açılış, beklenen
        // kutuyu geciktirmekten başka bir işe yaramazdı.
        <div className="animate-fade-in">
          <Label htmlFor="totp">Doğrulama kodu</Label>
          <TextInput
            id="totp"
            /* inputMode=numeric telefonda tuş takımını açar; type=text kalıyor
               çünkü yedek kod harf içerir ve type=number onu reddederdi. */
            inputMode="numeric"
            placeholder="123456"
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            autoComplete="one-time-code"
            autoFocus
          />
          <p className="mt-1.5 text-xs text-ink-faint">
            Authenticator uygulamanızdaki altı haneli kodu girin. Telefonunuza
            erişemiyorsanız yedek kodlarınızdan birini yazabilirsiniz.
          </p>
        </div>
      )}
      <ErrorLine error={error ? new Error(error) : null} />
      <Stagger index={2} className="mt-1">
        <Button type="submit" loading={loading} className="w-full">
          {loading
            ? "Giriş yapılıyor…"
            : needsTotp
              ? "Doğrula ve giriş yap"
              : "Giriş yap"}
        </Button>
      </Stagger>
      <Stagger index={3}>
        <Link
          href="/sifremi-unuttum"
          className="block text-center text-body-sm text-ink-faint transition-colors hover:text-ink"
        >
          Şifremi unuttum
        </Link>
      </Stagger>
    </form>
  );
}
