import Link from "next/link";
import { auth } from "@/auth";
import { defaultRouteForRole } from "@repo/auth/rbac";
import { ROLE_LABELS } from "@repo/types";
import { AuthShell } from "@/components/auth-shell";
import { LinkButton } from "@/components/form";

/**
 * Ön kapı.
 *
 * Kendi kabuğunu çiziyordu — degrade bir marka karesi, elle yazılmış bir düğme
 * ve `min-h-screen` ortalanmış bir sütun. Oysa oturumsuz üç ekranın (giriş,
 * bayilik başvurusu, şifre sıfırlama) zaten ortak bir kabuğu var ve kök sayfa
 * onların kardeşi: ziyaretçinin gördüğü ilk yüzey. `AuthShell`e alınınca sahne,
 * tema düğmesi ve kart ölçüleri bedava geldi.
 *
 * Oturum açmış kullanıcı buraya iki yoldan geliyor: adresi elle yazarak ya da
 * `/403`ün "ana sayfaya dön" bağlantısıyla. İkisinde de sorulan tek soru
 * "nereye gideceğim" — cevabı rolünün varsayılan rotası.
 */
export default async function HomePage() {
  const session = await auth();
  const user = session?.user;

  return (
    <AuthShell
      eyebrow={user ? ROLE_LABELS[user.role] : "Hoş geldiniz"}
      title={user ? `Merhaba, ${user.name}` : "B2B Sipariş & Yönetim Sistemi"}
      subtitle={
        user
          ? "Kaldığınız yerden devam edin; hangi ekranların açılacağına yetkileriniz karar verir."
          : "Bayi siparişi, cari takibi ve saha yönetimi tek yerde."
      }
      footer={
        user ? undefined : (
          <>
            Bayi hesabınız yok mu?{" "}
            <Link
              href="/kayit"
              className="font-medium text-ink underline underline-offset-4 transition-colors hover:text-ink-muted"
            >
              Bayilik başvurusu yapın
            </Link>
          </>
        )
      }
    >
      {user ? (
        <LinkButton
          href={defaultRouteForRole(user.role)}
          variant="primary"
          size="md"
          className="w-full"
        >
          Panele git
        </LinkButton>
      ) : (
        <LinkButton
          href="/login"
          variant="primary"
          size="md"
          className="w-full"
        >
          Giriş yap
        </LinkButton>
      )}
    </AuthShell>
  );
}
