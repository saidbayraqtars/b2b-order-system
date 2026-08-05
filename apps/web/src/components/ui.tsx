import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, PackageSearch } from "lucide-react";
import { cn } from "@/lib/utils";

/** Genel kart yüzeyi — Panel'in başlıksız, tek kullanımlık hali (stat kutusu, ürün kartı vb.). */
export function Card({
  children,
  className,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  /** Fare üzerine geldiğinde hafif yükselsin mi — tıklanabilir kartlar için. */
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 bg-white p-4 shadow-card dark:border-neutral-800 dark:bg-neutral-900",
        hover && "transition-shadow hover:shadow-card-hover",
        className,
      )}
    >
      {children}
    </div>
  );
}

const BADGE_TONE = {
  neutral: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  danger: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  info: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
} as const;

export type BadgeTone = keyof typeof BADGE_TONE;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        BADGE_TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Sayfa üstü başlık bloğu — h1 + alt metin + sağda opsiyonel aksiyon/geri linki. */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        {back && (
          <Link
            href={back.href}
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-brand-600 dark:hover:text-brand-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {back.label}
          </Link>
        )}
        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-neutral-500">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  );
}

/** Tam ekran değil, panel-içi bekleme durumu — "Yükleniyor…" düz metninin yerine. */
export function LoadingState({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 py-6 text-sm text-neutral-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </p>
  );
}

/** Boş liste/tablo durumu — ikon + mesaj, sade ama "unutulmuş ekran" hissi vermez. */
export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-neutral-400">
      <PackageSearch className="h-6 w-6" />
      {label}
    </div>
  );
}
