import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { PERMISSION_LABELS, PERMISSIONS, type Permission } from "@repo/types";

/**
 * Yetki reddi. `?perm=` ile gelen izin adı gösterilir: kullanıcı "yetkim yok"u
 * değil, *hangi* yetkinin eksik olduğunu görsün ki yöneticisinden isterken ne
 * isteyeceğini bilsin. Anahtar bilinen listeden doğrulanıyor — URL'den gelen
 * serbest metin ekrana basılmaz.
 *
 * Kabuksuz ve ortalanmış: buraya gelen kullanıcının yapabileceği tek şey geri
 * dönmek, ve yanında bir gezinme çubuğu olsaydı o çubuktaki bağlantıların
 * yarısı yine buraya çıkardı.
 */
export default function ForbiddenPage({
  searchParams,
}: {
  searchParams: { perm?: string };
}) {
  const perm = PERMISSIONS.includes(searchParams.perm as Permission)
    ? (searchParams.perm as Permission)
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-critical/10 text-critical">
        <ShieldAlert className="h-7 w-7" />
      </span>
      <h1 className="text-display tabular-nums text-ink">403</h1>
      <p className="text-body-sm text-ink-muted">
        {perm ? (
          <>
            Bu sayfa{" "}
            <strong className="font-semibold text-ink">
              {PERMISSION_LABELS[perm]}
            </strong>{" "}
            yetkisini gerektiriyor. Hesabınızda bu yetki yok.
          </>
        ) : (
          "Bu sayfaya erişim yetkiniz yok."
        )}
      </p>
      {/* Kök sayfa kullanıcıyı rolüne göre doğru panele yolluyor; buradan
          hangi panelin doğru olduğunu bilmek için oturumu okumak gerekirdi ve
          yetki hatası veren bir ekranın yapması gereken son şey bu. */}
      <Link
        href="/"
        className="text-body-sm font-medium text-ink underline underline-offset-4 transition-colors hover:text-ink-muted"
      >
        Ana sayfaya dön
      </Link>
    </main>
  );
}
