"use client";

import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from "react";

// Small form primitives shared by the admin screens. Plain Tailwind, matching
// the rest of the portal — no component library in this project.

const CONTROL =
  "h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm text-neutral-900 outline-none focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

export function Label({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
      {children}
      {hint ? <span className="ml-1 font-normal text-neutral-400">{hint}</span> : null}
    </span>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={`min-h-20 w-full rounded-md border border-neutral-300 bg-white p-2 text-sm text-neutral-900 outline-none focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 ${props.className ?? ""}`}
    />
  );
}

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700",
    secondary:
      "border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800",
    danger: "bg-red-600 text-white hover:bg-red-700",
  } as const;
  return (
    <button
      type="button"
      {...props}
      className={`h-9 rounded-md px-3 text-sm font-medium disabled:opacity-50 ${styles[variant]} ${props.className ?? ""}`}
    >
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
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">{title}</h2>
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
    <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
      {error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu"}
    </p>
  );
}
