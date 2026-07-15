import Link from "next/link";
import { auth } from "@/auth";
import { defaultRouteForRole } from "@repo/auth/rbac";

export default async function HomePage() {
  const session = await auth();

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-24">
      <h1 className="text-3xl font-bold">B2B Sipariş &amp; Yönetim Sistemi</h1>
      {session?.user ? (
        <div className="flex flex-col gap-3">
          <p>
            Hoş geldin, <strong>{session.user.name}</strong> ({session.user.role})
          </p>
          <Link
            href={defaultRouteForRole(session.user.role)}
            className="w-fit rounded-md bg-neutral-900 px-4 py-2 text-white dark:bg-white dark:text-neutral-900"
          >
            Panele git
          </Link>
        </div>
      ) : (
        <Link
          href="/login"
          className="w-fit rounded-md bg-neutral-900 px-4 py-2 text-white dark:bg-white dark:text-neutral-900"
        >
          Giriş yap
        </Link>
      )}
    </main>
  );
}
