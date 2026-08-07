import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { PERMISSION_LABELS, PERMISSIONS, type Permission } from "@repo/types";

/**
 * Yetki reddi. `?perm=` ile gelen izin adı gösterilir: kullanıcı "yetkim yok"u
 * değil, *hangi* yetkinin eksik olduğunu görsün ki yöneticisinden isterken ne
 * isteyeceğini bilsin. Anahtar bilinen listeden doğrulanıyor — URL'den gelen
 * serbest metin ekrana basılmaz.
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
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
        <ShieldAlert className="h-7 w-7" />
      </span>
      <h1 className="font-display text-3xl font-bold text-neutral-900 dark:text-white">
        403
      </h1>
      <p className="text-neutral-500">
        {perm ? (
          <>
            Bu sayfa <strong className="text-neutral-700 dark:text-neutral-200">
              {PERMISSION_LABELS[perm]}
            </strong>{" "}
            yetkisini gerektiriyor. Hesabınızda bu yetki yok.
          </>
        ) : (
          "Bu sayfaya erişim yetkiniz yok."
        )}
      </p>
      <Link
        href="/"
        className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        Ana sayfaya dön
      </Link>
    </main>
  );
}
