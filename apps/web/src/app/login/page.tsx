import { Suspense } from "react";
import { LoginForm } from "./_components/login-form";

// The form reads ?callbackUrl via useSearchParams, which App Router requires to
// sit inside a Suspense boundary — without one the whole route fails to
// prerender at build time.
export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-bold text-white shadow-sm shadow-brand-600/30">
          B
        </span>
        <div className="text-center">
          <h1 className="font-display text-xl font-bold text-neutral-900 dark:text-white">
            B2B Portale giriş yap
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Sipariş &amp; Yönetim Sistemi
          </p>
        </div>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-card dark:border-neutral-800 dark:bg-neutral-900">
        <Suspense
          fallback={<p className="text-sm text-neutral-500">Yükleniyor…</p>}
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
