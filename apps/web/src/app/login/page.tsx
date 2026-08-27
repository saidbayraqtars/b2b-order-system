import { Suspense } from "react";
import Link from "next/link";
import { LoadingState } from "@/components/ui";
import { AuthShell } from "@/components/auth-shell";
import { DemoLogin } from "./_components/demo-login";
import { LoginForm } from "./_components/login-form";

export const metadata = { title: "Giriş" };

// The form reads ?callbackUrl via useSearchParams, which App Router requires to
// sit inside a Suspense boundary — without one the whole route fails to
// prerender at build time.
export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="Giriş"
      title="Portala giriş yapın"
      subtitle="Hesabınızla devam edin; hangi ekranların açılacağına yetkileriniz karar verir."
      footer={
        <>
          Bayi hesabınız yok mu?{" "}
          <Link
            href="/kayit"
            className="font-medium text-ink underline underline-offset-4 transition-colors hover:text-ink-muted"
          >
            Bayilik başvurusu yapın
          </Link>
        </>
      }
    >
      <Suspense fallback={<LoadingState />}>
        <LoginForm />
      </Suspense>

      {/*
        Gösterim girişi iki kapıdan geçiyor: geliştirme derlemesi **ve**
        `DEMO_LOGIN=1`. Koşul sunucuda değerlendiği için üretim derlemesinde
        bileşen paketin içine hiç girmiyor — istemciye taşınan bir bayrak olsaydı,
        kapalıyken bile kodu (ve hesap listesini) yayınlamış olurduk. İkinci
        kapı, gösterim verisi silinmiş temiz bir kurulumda çalışmayan düğmelerin
        ekranda durmaması için.
      */}
      {process.env.NODE_ENV === "development" &&
        process.env.DEMO_LOGIN === "1" && (
          <Suspense fallback={null}>
            <DemoLogin />
          </Suspense>
        )}
    </AuthShell>
  );
}
