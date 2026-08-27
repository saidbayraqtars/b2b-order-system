import { Suspense } from "react";
import Link from "next/link";
import { LoadingState } from "@/components/ui";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "../_components/reset-password-form";

export const metadata = { title: "Yeni şifre" };

// The token arrives as ?token=…, read client-side via useSearchParams — which
// App Router only allows inside a Suspense boundary.
export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="Yeni şifre"
      title="Yeni şifrenizi belirleyin"
      subtitle="Şifreniz değiştiğinde açık olan tüm oturumlar kapanır."
      footer={
        <Link
          href="/login"
          className="font-medium text-ink underline underline-offset-4 transition-colors hover:text-ink-muted"
        >
          Giriş ekranına dön
        </Link>
      }
    >
      <Suspense fallback={<LoadingState />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
