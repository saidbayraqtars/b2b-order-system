"use client";

import { useEffect } from "react";
import type {
  ReactNode,
  SelectHTMLAttributes,
  InputHTMLAttributes,
} from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Admin ekranlarının paylaştığı form/panel bileşenleri. Plan büyük bir bileşen
// kütüphanesi değil — düz Tailwind, ama tek noktadan: marka rengi, gölge ve
// köşe yarıçapı burada değişince 20 ekrana birden yansır.

const CONTROL = cn(
  "w-full rounded-lg border border-neutral-300 bg-white text-neutral-900",
  "placeholder:text-neutral-400 outline-none transition-colors",
  "hover:border-neutral-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10",
  "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400",
  "dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-600",
  "dark:disabled:bg-neutral-900/50 dark:disabled:text-neutral-600",
);

/**
 * Kontrol boyu.
 *
 * `sm`, rapor tasarımcısı gibi tek satıra beş kontrol dizen yoğun ekranlar için:
 * orada her kontrolü 40 piksele çıkarmak satırı sarmalıyor. Ekranlar bu boyu
 * kendi sınıflarını yazarak elde ediyordu ve üç ayrı yükseklik ortaya çıkmıştı
 * (`h-7`, `h-8`, `h-9`) — ikisi seçildi, gerisi gitti.
 */
const CONTROL_SIZE = {
  sm: "h-8 px-2 text-xs",
  md: "h-10 px-3 text-sm",
} as const;

export type ControlSize = keyof typeof CONTROL_SIZE;

export function Label({
  children,
  hint,
  htmlFor,
}: {
  children: ReactNode;
  hint?: string;
  /** Verilirse gerçek bir <label for=…> üretir — ekran okuyucu input'a bağlar. */
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-xs font-medium text-neutral-700 dark:text-neutral-300"
    >
      {children}
      {hint ? (
        <span className="ml-1 font-normal text-neutral-400">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput({
  size = "md",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  size?: ControlSize;
}) {
  return (
    <input
      {...props}
      className={cn(CONTROL, CONTROL_SIZE[size], props.className)}
    />
  );
}

export function Select({
  size = "md",
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  size?: ControlSize;
}) {
  return (
    <select
      {...props}
      className={cn(CONTROL, CONTROL_SIZE[size], props.className)}
    />
  );
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={cn(CONTROL, "min-h-20 px-3 py-2 text-sm", props.className)}
    />
  );
}

/**
 * Onay kutusu.
 *
 * 19 ekranda ham `<input type="checkbox">` olarak duruyordu: kimi etiketiyle
 * `<label>` içindeydi, kimi yanındaki metne hiç bağlı değildi (yani metne
 * tıklamak işe yaramıyordu), hiçbirinde odak halkası yoktu. Yerli kutu
 * korunuyor — erişilebilirliği ve klavye davranışı bedava — yalnızca rengi,
 * odak halkası ve etikete bağlanması tek yerde.
 */
export function Checkbox({
  label,
  hint,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
  hint?: string;
}) {
  const box = (
    <input
      {...props}
      type="checkbox"
      className={cn(
        "h-4 w-4 shrink-0 cursor-pointer rounded border-neutral-300 accent-brand-600",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "dark:border-neutral-600",
        className,
      )}
    />
  );

  // Etiketsiz kullanım (tablo başlığındaki "hepsini seç" gibi) hâlâ mümkün.
  if (label === undefined) return box;

  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300",
        props.disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {box}
      <span>
        {label}
        {hint ? (
          <span className="ml-1 text-xs text-neutral-400">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}

const BUTTON_VARIANT = {
  primary:
    "bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700 active:bg-brand-800",
  secondary:
    "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 hover:border-neutral-400 active:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:border-neutral-600",
  danger:
    "bg-red-600 text-white shadow-sm shadow-red-600/20 hover:bg-red-700 active:bg-red-800",
  success:
    "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 active:bg-emerald-800",
  ghost:
    "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
} as const;

const BUTTON_SIZE = {
  sm: "h-8 gap-1.5 px-2.5 text-xs",
  md: "h-10 gap-2 px-4 text-sm",
} as const;

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANT;
  size?: keyof typeof BUTTON_SIZE;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        props.className,
      )}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

/**
 * Düğme gibi görünen bağlantı.
 *
 * "Kargo etiketi", "yol tarifi", "yeni rapor" gibi yerlerde gerçekten gezinme
 * var — `<button onClick={router.push}>` yeni sekmede açmayı, orta tıklamayı ve
 * bağlantı adresini görmeyi bozardı. Bu yüzden eleman `<a>` kalıyor, yalnızca
 * görünümü `Button`la ortak. Sınıfları elle yazılan beş ekran vardı ve üçü
 * birbirinden farklı yükseklikteydi.
 */
export function LinkButton({
  variant = "secondary",
  size = "sm",
  className,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: keyof typeof BUTTON_VARIANT;
  size?: keyof typeof BUTTON_SIZE;
}) {
  return (
    <a
      {...props}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
    >
      {children}
    </a>
  );
}

export function Panel({
  title,
  action,
  children,
  /** Gövde dolgusunu kaldırmak için ("p-0") — kenardan kenara liste/tablo. */
  bodyClassName,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card dark:border-neutral-800 dark:bg-neutral-900">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          {title}
        </h2>
        {action}
      </header>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * Ortada açılan pencere.
 *
 * Escape kapatıyor ve arka plana tıklamak kapatıyor — ikisi de her yerde
 * beklenen davranış ve her ekranın kendi başına yazması gereken şeyler değil.
 * İçerik `form` olabilsin diye `children` serbest bırakılıyor; pencere yalnızca
 * kabuk.
 */
export function Modal({
  title,
  onClose,
  children,
  width = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      // Yalnızca zemine tıklanınca kapanıyor: içerideki bir sürükleme hareketi
      // dışarıda bitince pencere kapanmasın.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "w-full rounded-xl border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-800 dark:bg-neutral-900",
          width,
        )}
      >
        <h2 className="mb-3 text-base font-semibold text-neutral-900 dark:text-neutral-50">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

/** Inline error line for a failed mutation. */
export function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu"}
    </p>
  );
}
