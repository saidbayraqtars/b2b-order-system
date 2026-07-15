import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-4xl font-bold">403</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Bu sayfaya erişim yetkiniz yok.
      </p>
      <Link href="/" className="underline">
        Ana sayfaya dön
      </Link>
    </main>
  );
}
