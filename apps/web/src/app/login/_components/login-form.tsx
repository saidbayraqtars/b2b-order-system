"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginSchema } from "@repo/types";
import { Button, ErrorLine, Label, TextInput } from "@/components/form";

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Geçersiz giriş");
      return;
    }

    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);

    if (res?.error) {
      setError("E-posta veya şifre hatalı");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {reason && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {reason}
        </p>
      )}
      <div>
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
      </div>
      <div>
        <Label htmlFor="password">Şifre</Label>
        <TextInput
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <ErrorLine error={error ? new Error(error) : null} />
      <Button type="submit" loading={loading} className="mt-1 w-full">
        {loading ? "Giriş yapılıyor…" : "Giriş yap"}
      </Button>
      <Link
        href="/sifremi-unuttum"
        className="text-center text-sm text-neutral-500 hover:text-brand-600 dark:hover:text-brand-400"
      >
        Şifremi unuttum
      </Link>
    </form>
  );
}
