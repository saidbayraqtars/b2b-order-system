import { Suspense } from "react";
import { LoadingState } from "@/components/ui";
import Link from "next/link";
import { ResetPasswordForm } from "../_components/reset-password-form";

export const metadata = { title: "Yeni şifre" };

// The token arrives as ?token=…, read client-side via useSearchParams — which
// App Router only allows inside a Suspense boundary.
export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-bold">Yeni şifre belirle</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Şifreniz değiştiğinde açık olan tüm oturumlar kapanır.
        </p>
      </div>
      <Suspense fallback={<LoadingState />}>
        <ResetPasswordForm />
      </Suspense>
      <Link href="/login" className="text-sm text-neutral-500 underline">
        Girişe dön
      </Link>
    </main>
  );
}
