import type { ReactNode } from "react";
import { brandingUrl, loadTenant } from "@repo/services";
import { PrintButton } from "./print-button";

// Shared frame for the printable documents. Deliberately plain: white paper,
// black text, no dark-mode inversion, and the toolbar disappears when printed.
// A waybill or an invoice is a record someone files — it has to come out of the
// printer looking the same on every machine.
//
// The seller block lives here rather than in each document, so an invoice and a
// waybill cannot end up naming the firm differently. It comes from the tenant
// folder (tenants/<slug>/tenant.json), because every customer runs its own
// installation and the seller is a property of the deployment.

export async function DocumentShell({
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
        <header className="mb-6 flex items-start justify-between gap-8 border-b border-neutral-300 pb-4">
          <SellerBlock />
          <div className="shrink-0 text-right">
            <h1 className="text-xl font-bold">{title}</h1>
            <p className="text-neutral-600">{subtitle}</p>
            <div className="mt-2 flex justify-end">
              <PrintButton />
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

/**
 * Who issued this document.
 *
 * If the installation has no tenant folder the block is replaced by a loud
 * failure rather than being left out. A document that quietly prints with no
 * seller on it looks valid and is not — that is exactly the fault this block
 * exists to prevent, so it must never fail silently.
 */
async function SellerBlock() {
  let tenant;
  try {
    tenant = await loadTenant();
  } catch (e) {
    return (
      <div className="rounded border-2 border-red-500 bg-red-50 p-3 text-red-800">
        <p className="font-bold uppercase">Kurulum eksik — bu belge geçersizdir</p>
        <p className="mt-1 whitespace-pre-line text-xs">
          {e instanceof Error ? e.message : String(e)}
        </p>
      </div>
    );
  }

  const { seller, branding } = tenant;
  const logo = brandingUrl(branding.logo);
  const address = seller.address;

  return (
    <div className="min-w-0">
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={seller.legalName}
          className="mb-2 h-12 w-auto max-w-[220px] object-contain object-left"
        />
      )}
      <p className="font-bold">{seller.legalName}</p>
      <p className="text-neutral-700">
        {address.line1}
        {address.line2 ? `, ${address.line2}` : ""}
      </p>
      <p className="text-neutral-700">
        {[address.district, address.city, address.postalCode]
          .filter(Boolean)
          .join(" / ")}
      </p>
      <p className="text-neutral-700">
        V.D. {seller.taxOffice} · VKN {seller.taxNumber}
      </p>
      {(seller.mersisNo || seller.tradeRegistryNo) && (
        <p className="text-xs text-neutral-600">
          {seller.mersisNo ? `MERSİS ${seller.mersisNo}` : ""}
          {seller.mersisNo && seller.tradeRegistryNo ? " · " : ""}
          {seller.tradeRegistryNo ? `Tic. Sicil ${seller.tradeRegistryNo}` : ""}
        </p>
      )}
      {(seller.phone || seller.email || seller.website) && (
        <p className="text-xs text-neutral-600">
          {[seller.phone, seller.email, seller.website].filter(Boolean).join(" · ")}
        </p>
      )}
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

/**
 * Where to pay. Only on the invoice — a waybill carries goods, not money.
 * Rendered from the tenant folder so changing bank does not need a deploy.
 */
export async function SellerBankAccounts() {
  let accounts;
  try {
    accounts = (await loadTenant()).seller.bankAccounts;
  } catch {
    return null; // the header already said the installation is incomplete
  }
  if (accounts.length === 0) return null;

  return (
    <section className="mt-6 border-t border-neutral-300 pt-3">
      <p className="mb-1 text-xs font-semibold uppercase text-neutral-500">
        Ödeme bilgileri
      </p>
      {accounts.map((a) => (
        <p key={a.iban} className="text-xs">
          <span className="text-neutral-600">{a.label}</span>{" "}
          <span className="font-mono tabular-nums">{formatIban(a.iban)}</span>
        </p>
      ))}
    </section>
  );
}

/** TR IBANs are read in fours; stored without spaces, shown with them. */
function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}
