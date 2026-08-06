import { notFound } from "next/navigation";
import { getInvoice } from "@repo/services";
import { formatTRY } from "@/lib/format";
import { requirePage } from "@/lib/guard";
import { assertInvoiceVisible } from "@/lib/order-access";
import {
  DocumentField,
  DocumentParty,
  DocumentShell,
  SellerBankAccounts,
} from "../../_components/document-shell";

const ALL_ROLES = [
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
  "SALES_REP",
] as const;

function trDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR");
}

export default async function InvoiceDocumentPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requirePage(ALL_ROLES);
  await assertInvoiceVisible(user, params.id);

  const invoice = await getInvoice(params.id).catch(() => null);
  if (!invoice) notFound();

  return (
    <DocumentShell
      title={`Fatura ${invoice.documentNumber}`}
      subtitle={`Sipariş ${invoice.orderNumber} · ${trDate(invoice.issuedAt)}`}
    >
      {invoice.status === "CANCELLED" && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 font-semibold text-red-700">
          İPTAL EDİLDİ — bu belge geçersizdir.
        </p>
      )}

      <section className="mb-6 grid gap-6 sm:grid-cols-2">
        <DocumentParty
          label="Müşteri"
          lines={[
            invoice.company.name,
            invoice.company.taxOffice ? `V.D. ${invoice.company.taxOffice}` : null,
            invoice.company.taxNumber ? `VKN ${invoice.company.taxNumber}` : null,
          ]}
        />
        <div className="space-y-1">
          <DocumentField label="Fatura tarihi" value={trDate(invoice.issuedAt)} />
          <DocumentField label="Vade tarihi" value={trDate(invoice.dueDate)} />
          {invoice.externalNumber && (
            <DocumentField label="ERP numarası" value={invoice.externalNumber} />
          )}
          {invoice.shipmentNumbers.length > 0 && (
            <DocumentField
              label="İrsaliye"
              value={invoice.shipmentNumbers.join(", ")}
            />
          )}
        </div>
      </section>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-y border-neutral-300 text-xs uppercase text-neutral-600">
            <th className="py-2">Ürün</th>
            <th className="py-2">SKU</th>
            <th className="py-2 text-right">Adet</th>
            <th className="py-2 text-right">Birim</th>
            <th className="py-2 text-right">İskonto</th>
            <th className="py-2 text-right">Kampanya</th>
            <th className="py-2 text-right">KDV</th>
            <th className="py-2 text-right">Tutar</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((i) => (
            <tr key={i.id} className="border-b border-neutral-200">
              <td className="py-2">{i.productName}</td>
              <td className="py-2 text-neutral-500">{i.sku}</td>
              <td className="py-2 text-right tabular-nums">{i.quantity}</td>
              <td className="py-2 text-right tabular-nums">{formatTRY(i.unitPrice)}</td>
              <td className="py-2 text-right tabular-nums">
                {Number(i.discount) > 0 ? formatTRY(i.discount) : "—"}
              </td>
              <td className="py-2 text-right tabular-nums">
                {Number(i.promotionDiscount) > 0
                  ? `− ${formatTRY(i.promotionDiscount)}`
                  : "—"}
              </td>
              <td className="py-2 text-right tabular-nums">%{i.vatRate}</td>
              <td className="py-2 text-right tabular-nums">{formatTRY(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-4 flex justify-end">
        <div className="w-64 space-y-1">
          <DocumentField label="Ara toplam" value={formatTRY(invoice.subtotal)} />
          <DocumentField label="İskonto" value={formatTRY(invoice.discountTotal)} />
          {Number(invoice.promotionTotal) > 0 && (
            <DocumentField
              label="Kampanya"
              value={`− ${formatTRY(invoice.promotionTotal)}`}
            />
          )}
          {Number(invoice.shippingFee) > 0 && (
            <DocumentField label="Nakliye" value={formatTRY(invoice.shippingFee)} />
          )}
          <DocumentField label="KDV" value={formatTRY(invoice.taxTotal)} />
          <DocumentField
            label="Genel toplam"
            value={formatTRY(invoice.grandTotal)}
            strong
          />
        </div>
      </section>

      {invoice.note && (
        <p className="mt-6 border-t border-neutral-200 pt-3 text-neutral-600">
          {invoice.note}
        </p>
      )}
      {/* Only on the invoice: a waybill carries goods, not money. */}
      <SellerBankAccounts />
      <p className="mt-6 text-xs text-neutral-500">
        Düzenleyen: {invoice.createdByName}
      </p>
    </DocumentShell>
  );
}
