import { notFound } from "next/navigation";
import { prisma } from "@repo/database";
import { listShipmentLots } from "@repo/services";
import { requirePage } from "@/lib/guard";
import { assertShipmentVisible } from "@/lib/order-access";
import {
  DocumentField,
  DocumentParty,
  DocumentShell,
} from "../../_components/document-shell";

const ALL_ROLES = [
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
  "SALES_REP",
] as const;

function trDate(d: Date): string {
  return d.toLocaleDateString("tr-TR");
}

/** Parti satırı: "P-2411 (SKT 12.03.2027) · 24 adet". */
function lotLabel(lot: {
  code: string | null;
  expiryDate: string | null;
  quantity: number;
}): string {
  const head = lot.code ?? "parti girilmemiş";
  const skt = lot.expiryDate
    ? ` (SKT ${trDate(new Date(lot.expiryDate))})`
    : "";
  return `${head}${skt} · ${lot.quantity} adet`;
}

export default async function ShipmentDocumentPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requirePage(ALL_ROLES, "documents.view");
  await assertShipmentVisible(user, params.id);

  // A waybill carries goods, not money: quantities and addresses only. Prices
  // deliberately stay off it — the invoice is where they belong.
  const shipment = await prisma.shipment.findUnique({
    where: { id: params.id },
    select: {
      documentNumber: true,
      externalNumber: true,
      shippedAt: true,
      carrier: true,
      trackingNumber: true,
      note: true,
      shippedBy: { select: { name: true } },
      invoice: { select: { documentNumber: true } },
      order: {
        select: {
          orderNumber: true,
          company: {
            select: { name: true, taxNumber: true, taxOffice: true },
          },
          shippingAddress: {
            select: {
              label: true,
              line1: true,
              line2: true,
              district: true,
              city: true,
            },
          },
        },
      },
      items: {
        select: {
          id: true,
          quantity: true,
          orderItem: {
            select: { productName: true, sku: true, quantity: true },
          },
        },
      },
    },
  });
  if (!shipment) notFound();

  // Parti dökümü **basılıyor**, deftere gidip aranmıyor: geri çağırmada
  // aranacak tek kâğıt bu, ve "hangi SKT'li mal kime gitti" sorusunun cevabı
  // müşterinin elindeki nüshada da durmalı.
  //
  // Sipariş başına değil irsaliye başına: parça parça sevk edilen bir siparişin
  // bütün partilerini ilk irsaliyeye basmak, depoda duran malı teslim edilmiş
  // göstermek olurdu (bkz. `listShipmentLots`).
  const lotLines = await listShipmentLots(params.id);
  const lotsByItem = new Map(lotLines.map((l) => [l.shipmentItemId, l.lots]));
  const anyLots = lotLines.some((l) =>
    l.lots.some((lot) => lot.code !== null),
  );

  const address = shipment.order.shippingAddress;

  return (
    <DocumentShell
      title={`İrsaliye ${shipment.documentNumber}`}
      subtitle={`Sipariş ${shipment.order.orderNumber} · ${trDate(shipment.shippedAt)}`}
    >
      <section className="mb-6 grid gap-6 sm:grid-cols-2">
        <DocumentParty
          label="Alıcı"
          lines={[
            shipment.order.company.name,
            shipment.order.company.taxOffice
              ? `V.D. ${shipment.order.company.taxOffice}`
              : null,
            shipment.order.company.taxNumber
              ? `VKN ${shipment.order.company.taxNumber}`
              : null,
          ]}
        />
        <DocumentParty
          label="Teslim adresi"
          lines={
            address
              ? [
                  address.label,
                  address.line1,
                  address.line2,
                  [address.district, address.city].filter(Boolean).join(" / "),
                ]
              : ["Adres belirtilmemiş"]
          }
        />
      </section>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-y border-neutral-300 text-xs uppercase text-neutral-600">
            <th className="py-2">Ürün</th>
            <th className="py-2">SKU</th>
            <th className="py-2 text-right">Sevk edilen</th>
            <th className="py-2 text-right">Sipariş</th>
          </tr>
        </thead>
        <tbody>
          {shipment.items.map((i) => {
            const lots = (lotsByItem.get(i.id) ?? []).filter(
              (lot) => lot.code !== null,
            );
            return (
              <tr key={i.id} className="border-b border-neutral-200">
                <td className="py-2">
                  {i.orderItem.productName}
                  {lots.length > 0 && (
                    <span className="block text-xs text-neutral-500">
                      Parti: {lots.map(lotLabel).join(" · ")}
                    </span>
                  )}
                </td>
                <td className="py-2 text-neutral-500">{i.orderItem.sku}</td>
                <td className="py-2 text-right tabular-nums">{i.quantity}</td>
                <td className="py-2 text-right tabular-nums text-neutral-500">
                  {i.orderItem.quantity}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section className="mt-4 grid gap-1 sm:w-72">
        {shipment.carrier && (
          <DocumentField label="Taşıyıcı" value={shipment.carrier} />
        )}
        {shipment.trackingNumber && (
          <DocumentField label="Takip no" value={shipment.trackingNumber} />
        )}
        {shipment.externalNumber && (
          <DocumentField label="ERP numarası" value={shipment.externalNumber} />
        )}
        {shipment.invoice && (
          <DocumentField
            label="Fatura"
            value={shipment.invoice.documentNumber}
          />
        )}
      </section>

      {anyLots && (
        <p className="mt-3 text-xs text-neutral-500">
          Parti ve son kullanma tarihleri sevk sırasına göre yazılmıştır. Parti
          takibi olmayan kalemlerde satır boş kalır.
        </p>
      )}

      {shipment.note && (
        <p className="mt-6 border-t border-neutral-200 pt-3 text-neutral-600">
          {shipment.note}
        </p>
      )}

      <section className="mt-10 grid grid-cols-2 gap-8 text-xs text-neutral-500">
        <div className="border-t border-neutral-400 pt-2">
          Teslim eden: {shipment.shippedBy.name}
        </div>
        <div className="border-t border-neutral-400 pt-2">Teslim alan</div>
      </section>
    </DocumentShell>
  );
}
