"use client";

import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Admin ekranlarının paylaştığı form/panel bileşenleri. Plan büyük bir bileşen
// kütüphanesi değil — düz Tailwind, ama tek noktadan: marka rengi, gölge ve
// köşe yarıçapı burada değişince 20 ekrana birden yansır.

const CONTROL = cn(
  "h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900",
  "placeholder:text-neutral-400 outline-none transition-colors",
  "hover:border-neutral-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10",
  "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400",
  "dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-600",
  "dark:disabled:bg-neutral-900/50 dark:disabled:text-neutral-600",
);

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
      {hint ? <span className="ml-1 font-normal text-neutral-400">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROL, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(CONTROL, props.className)} />;
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={cn(CONTROL, "h-auto min-h-20 py-2", props.className)}
    />
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

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card dark:border-neutral-800 dark:bg-neutral-900">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          {title}
        </h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
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
