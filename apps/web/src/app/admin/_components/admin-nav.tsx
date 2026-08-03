import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

const LINKS = [
  { href: "/admin", label: "Panel" },
  { href: "/admin/products", label: "Ürünler" },
  { href: "/admin/categories", label: "Kategoriler" },
  { href: "/admin/reports", label: "Raporlar" },
  { href: "/reports", label: "Rapor tasarımcısı" },
] as const;

/** Shared header for every admin screen. `current` renders as plain text. */
export function AdminNav({
  email,
  current,
}: {
  email: string;
  current: (typeof LINKS)[number]["href"];
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-3 dark:border-neutral-800">
      <nav className="flex items-center gap-4">
        {LINKS.map((l) =>
          l.href === current ? (
            <span key={l.href} className="text-sm font-semibold">
              {l.label}
            </span>
          ) : (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline dark:hover:text-neutral-100"
            >
              {l.label}
            </Link>
          ),
        )}
      </nav>
      <div className="flex items-center gap-3">
        <span className="text-sm text-neutral-500">{email}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
