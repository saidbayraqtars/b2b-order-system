"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPasswordSchema } from "@repo/types";

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
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        Bağlantı eksik ya da bozuk.{" "}
        <Link href="/sifremi-unuttum" className="underline">
          Yeni bağlantı isteyin
        </Link>
        .
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
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Şifre değiştirilemedi, tekrar deneyin");
      return;
    }
    setDone(true);
    // The old sessions are gone; there is nowhere to go but the login screen.
    setTimeout(() => router.push("/login"), 1500);
  }

  if (done) {
    return (
      <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
        Şifreniz güncellendi. Giriş ekranına yönlendiriliyorsunuz…
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input
        type="password"
        placeholder="Yeni şifre"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        autoComplete="new-password"
      />
      <input
        type="password"
        placeholder="Yeni şifre (tekrar)"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        autoComplete="new-password"
      />
      <p className="text-xs text-neutral-500">
        En az 8 karakter, bir harf ve bir rakam içermeli.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
      >
        {loading ? "Kaydediliyor…" : "Şifreyi güncelle"}
      </button>
    </form>
  );
}
