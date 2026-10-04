import Link from "next/link";
import { notFound } from "next/navigation";
import { isModuleEnabled } from "@repo/services";
import { AuthShell } from "@/components/auth-shell";
import { DealerApplicationForm } from "./_components/dealer-application-form";

export const metadata = { title: "Bayilik başvurusu" };

// Modül kapalıysa sayfa yok: kurulumun açık olup olmadığı istek anında okunuyor.
export const dynamic = "force-dynamic";

/**
 * Bayilik başvurusu — bu sistemdeki "kayıt ol".
 *
 * Form bir hesap açmıyor, bir talep gönderiyor. Sebep ticari: burada açılan her
 * müşteri bir caridir, cariye kredi limiti ve vade tanımlanır, siparişi borç
 * doğurur. Kendi kendine açılabilen bir cari, kimsenin onaylamadığı bir
 * alacaktır. Onay verildiğinde firma kartı ve yönetici hesabı yönetim
 * tarafından açılır, şifre belirleme bağlantısı e-posta ile gider.
 *
 * Ekranın metni de bunu saklamıyor: "kayıt ol" değil "başvuru gönder" yazıyor
 * ve gönderildikten sonra çıkan ekran hesabın açıldığını söylemiyor.
 */
export default async function DealerApplicationPage() {
  if (!(await isModuleEnabled("basvuru"))) notFound();
  return (
    <AuthShell
      eyebrow="Bayilik başvurusu"
      title="Bayi olmak için başvurun"
      subtitle="Formu doldurun; başvurunuz değerlendirildikten sonra portal hesabınız açılır ve şifre belirleme bağlantısı e-posta ile gönderilir."
      footer={
        <>
          Hesabınız var mı?{" "}
          <Link
            href="/login"
            className="font-medium text-ink underline underline-offset-4 transition-colors hover:text-ink-muted"
          >
            Giriş yapın
          </Link>
        </>
      }
    >
      <DealerApplicationForm />
    </AuthShell>
  );
}
