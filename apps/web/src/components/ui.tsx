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
        "rounded-xl border border-border bg-surface p-4 shadow-card",
        hover && "transition-shadow hover:shadow-card-hover",
        className,
      )}
    >
      {children}
    </div>
  );
}

const BADGE_TONE = {
  neutral: "bg-surface3 text-fg",
  // `text-primary` değil: koyu paketlerde yumuşak zemin markanın koyu tonudur
  // ve üstüne aynı ailenin parlak tonunu koymak rozeti okunmaz yapar. Her
  // pakette zeminin üstüne ne yazılacağını paket kendisi söylüyor.
  brand: "bg-primary-soft text-on-primary-soft",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
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
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {back.label}
          </Link>
        )}
        <h1 className="text-xl font-bold text-fg">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  );
}

/** Tam ekran değil, panel-içi bekleme durumu — "Yükleniyor…" düz metninin yerine. */
export function LoadingState({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 py-6 text-sm text-fg-muted">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </p>
  );
}

/** Boş liste/tablo durumu — ikon + mesaj, sade ama "unutulmuş ekran" hissi vermez. */
export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-fg-muted">
      <PackageSearch className="h-6 w-6" />
      {label}
    </div>
  );
}

/**
 * Sekme şeridi.
 *
 * İki ekranda iki farklı renkle yazılmıştı (biri indigo, biri marka rengi) —
 * aynı arayüzde iki "seçili sekme" görüntüsü, ekranların ayrı ayrı yazıldığını
 * ele veren türden bir tutarsızlık.
 */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (next: T) => void;
  items: ReadonlyArray<{ key: T; label: string; count?: number }>;
}) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          aria-current={value === item.key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            value === item.key
              ? "border-primary text-primary"
              : "border-transparent text-fg-muted hover:text-fg",
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="ml-1.5 text-xs text-fg-muted">{item.count}</span>
          )}
        </button>
      ))}
    </nav>
  );
}

// ─────────────────────────────────────────────
// TABLO
// ─────────────────────────────────────────────
//
// Yönetim panelinin yarısı tablo ve her ekran kendi başlık/hücre sınıflarını
// yazıyordu: aynı tablo bir ekranda `text-sm`, diğerinde `text-xs`, birinde
// koyu tema satır ayracı var, diğerinde yok. Aşağıdakiler bileşen kütüphanesi
// değil — `<table>`'ın kendisi yerinde duruyor, yalnızca sınıflar tek yerde.

/** Yatay kaydırma kabuğu + tablo. Dar ekranda sayfayı değil tabloyu kaydırır. */
export function Table({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className={cn("w-full text-left text-sm", className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
      {children}
    </thead>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return (
    <tbody className="divide-y divide-border">
      {children}
    </tbody>
  );
}

type CellAlign = "left" | "right" | "center";

const ALIGN: Record<CellAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function Th({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode;
  align?: CellAlign;
  className?: string;
}) {
  return (
    <th className={cn("whitespace-nowrap px-3 py-2 font-medium", ALIGN[align], className)}>
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  /** Sayı sütunu: eşit genişlikli rakamlar, aksi hâlde tutarlar zıplıyor. */
  numeric = false,
  muted = false,
  className,
  colSpan,
}: {
  children?: ReactNode;
  align?: CellAlign;
  numeric?: boolean;
  muted?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "px-3 py-2",
        ALIGN[align],
        numeric && "tabular-nums",
        muted && "text-xs text-fg-muted",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Tablo içi boş durum — `EmptyState`'in tek hücreye sığan hâli. */
export function TableEmpty({
  colSpan,
  label,
}: {
  colSpan: number;
  label: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-fg-muted">
        {label}
      </td>
    </tr>
  );
}
