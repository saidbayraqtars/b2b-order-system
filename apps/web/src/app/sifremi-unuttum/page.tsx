import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "./_components/forgot-password-form";

export const metadata = { title: "Şifremi unuttum" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Şifre sıfırlama"
      title="Şifrenizi mi unuttunuz?"
      subtitle="Hesabınızın e-posta adresini girin; sıfırlama bağlantısını gönderelim."
      footer={
        <Link
          href="/login"
          className="font-medium text-ink underline underline-offset-4 transition-colors hover:text-ink-muted"
        >
          Giriş ekranına dön
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
