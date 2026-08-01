import { Suspense } from "react";
import { LoginForm } from "./_components/login-form";

// The form reads ?callbackUrl via useSearchParams, which App Router requires to
// sit inside a Suspense boundary — without one the whole route fails to
// prerender at build time.
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-bold">Giriş yap</h1>
      <Suspense
        fallback={<p className="text-sm text-neutral-500">Yükleniyor…</p>}
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
