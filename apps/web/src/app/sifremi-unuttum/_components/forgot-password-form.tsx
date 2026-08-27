"use client";

import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { forgotPasswordSchema } from "@repo/types";
import { Stagger } from "@/components/auth-shell";
import { Button, ErrorLine, Label, TextInput } from "@/components/form";

/**
 * The success state is shown for every accepted submission, including addresses
 * that belong to nobody — matching the server, which refuses to reveal whether
 * an account exists. Do not "improve" this into an "unknown e-mail" message.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Geçersiz e-posta");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    }).catch(() => null);
    setLoading(false);

    if (!res?.ok) {
      setError("İstek gönderilemedi, tekrar deneyin");
      return;
    }
    const body = (await res.json()) as { message?: string };
    setSent(body.message ?? "Bağlantı gönderildi.");
  }

  if (sent) {
    return (
      <div className="animate-fade-up text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-positive/30 bg-positive/10">
          <MailCheck className="h-5 w-5 text-positive" />
        </span>
        <h2 className="mt-4 text-headline-sm text-ink">Bağlantı yolda</h2>
        <p className="mt-2 text-body-sm text-ink-muted">{sent}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
      <ErrorLine error={error ? new Error(error) : null} />
      <Stagger index={1} className="mt-1">
        <Button type="submit" loading={loading} className="w-full">
          {loading ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
        </Button>
      </Stagger>
    </form>
  );
}
