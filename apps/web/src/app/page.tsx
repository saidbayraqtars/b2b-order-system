import Link from "next/link";
import { auth } from "@/auth";
import { defaultRouteForRole } from "@repo/auth/rbac";

// Link zaten tıklanabilir bir <a>; içine <button> koymak (Button bileşeni)
// geçersiz HTML iç içeliği olurdu — o yüzden aynı görünüm burada elle verilir.
const CTA =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-600 px-6 text-sm font-medium text-white shadow-sm shadow-brand-600/20 transition-colors hover:bg-brand-700 active:bg-brand-800";

export default async function HomePage() {
  const session = await auth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-bold text-white shadow-sm shadow-brand-600/30">
        B
      </span>
      <h1 className="font-display max-w-lg text-3xl font-bold text-neutral-900 dark:text-white">
        B2B Sipariş &amp; Yönetim Sistemi
      </h1>

      {session?.user ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-neutral-500">
            Hoş geldin, <strong className="text-neutral-800 dark:text-neutral-200">{session.user.name}</strong>{" "}
            ({session.user.role})
          </p>
          <Link href={defaultRouteForRole(session.user.role)} className={CTA}>
            Panele git
          </Link>
        </div>
      ) : (
        <Link href="/login" className={CTA}>
          Giriş yap
        </Link>
      )}
    </main>
  );
}
