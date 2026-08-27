"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPasswordSchema } from "@repo/types";
import { Stagger } from "@/components/auth-shell";
import { Button, ErrorLine, Label, TextInput } from "@/components/form";

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <p className="flex items-start gap-2 rounded border border-caution/30 bg-caution/10 px-3 py-2 text-body-sm text-caution">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Bağlantı eksik ya da bozuk.{" "}
          <Link href="/sifremi-unuttum" className="underline underline-offset-4">
            Yeni bağlantı isteyin
          </Link>
          .
        </span>
      </p>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Şifreler eşleşmiyor");
      return;
    }
    const parsed = resetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Geçersiz şifre");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    }).catch(() => null);
    setLoading(false);

    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? "Şifre değiştirilemedi, tekrar deneyin");
      return;
    }
    setDone(true);
    // The old sessions are gone; there is nowhere to go but the login screen.
    setTimeout(() => router.push("/login"), 1500);
  }

  if (done) {
    return (
      <div className="animate-fade-up text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-positive/30 bg-positive/10">
          <CheckCircle2 className="h-5 w-5 text-positive" />
        </span>
        <h2 className="mt-4 text-headline-sm text-ink">Şifreniz güncellendi</h2>
        <p className="mt-2 text-body-sm text-ink-muted">
          Giriş ekranına yönlendiriliyorsunuz…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Stagger index={0}>
        <Label htmlFor="password">Yeni şifre</Label>
        <TextInput
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          autoFocus
        />
      </Stagger>
      <Stagger index={1}>
        <Label htmlFor="confirm">Yeni şifre (tekrar)</Label>
        <TextInput
          id="confirm"
          type="password"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        <p className="mt-1.5 text-xs text-ink-faint">
          En az 8 karakter, bir harf ve bir rakam içermeli.
        </p>
      </Stagger>
      <ErrorLine error={error ? new Error(error) : null} />
      <Stagger index={2} className="mt-1">
        <Button type="submit" loading={loading} className="w-full">
          {loading ? "Kaydediliyor…" : "Şifreyi güncelle"}
        </Button>
      </Stagger>
    </form>
  );
}
