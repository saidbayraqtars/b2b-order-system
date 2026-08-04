import Link from "next/link";
import { ForgotPasswordForm } from "./_components/forgot-password-form";

export const metadata = { title: "Şifremi unuttum" };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-bold">Şifremi unuttum</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Hesabınızın e-posta adresini girin; sıfırlama bağlantısını gönderelim.
        </p>
      </div>
      <ForgotPasswordForm />
      <Link href="/login" className="text-sm text-neutral-500 underline">
        Girişe dön
      </Link>
    </main>
  );
}
