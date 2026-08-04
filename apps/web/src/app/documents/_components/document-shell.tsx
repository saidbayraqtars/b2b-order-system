import type { ReactNode } from "react";
import { PrintButton } from "./print-button";

// Shared frame for the printable documents. Deliberately plain: white paper,
// black text, no dark-mode inversion, and the toolbar disappears when printed.
// A waybill or an invoice is a record someone files — it has to come out of the
// printer looking the same on every machine.

export function DocumentShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-neutral-900 shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-6 flex items-start justify-between border-b border-neutral-300 pb-4">
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            <p className="text-neutral-600">{subtitle}</p>
          </div>
          <PrintButton />
        </header>
        {children}
      </div>
    </div>
  );
}

export function DocumentParty({
  label,
  lines,
}: {
  label: string;
  lines: Array<string | null>;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase text-neutral-500">
        {label}
      </p>
      {lines.filter(Boolean).map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  );
}

export function DocumentField({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-6 ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-neutral-500"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
