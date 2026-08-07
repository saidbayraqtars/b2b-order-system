import { redirect } from "next/navigation";
import {
  BusinessError,
  buildOrderLabelData,
  buildShipmentLabelData,
  resolveLabelTemplate,
  assertOrdersPrintable,
  assertShipmentsPrintable,
} from "@repo/services";
import { LabelTemplateKindEnum } from "@repo/types";
import { requirePage } from "@/lib/guard";
import { PrintButton } from "../_components/print-button";
import { LabelSheet } from "./_components/label-sheet";

/**
 * Etiket ve fiş basım görünümü.
 *
 * Tek uç, üç tür: `?kind=CARGO_LABEL&shipments=a,b` ya da
 * `?kind=ORDER_RECEIPT&orders=a,b`. Toplu basım ayrı bir ekran değil, aynı
 * sayfaya birden çok kimlik verilmesi — "tek tek çıkar" ile "toplu çıkar"
 * arasında iki farklı çıktı düzeni olmamalı.
 *
 * Kâğıt ölçüsü `@page` ile şablondan geliyor; tarayıcının yazdırma penceresi
 * 80 mm rulo ya da 100 mm etiket için doğru boyutta açılıyor.
 */

const ALL_ROLES = [
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
  "SALES_REP",
  "COURIER",
] as const;

export const dynamic = "force-dynamic";

function ids(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200); // tek seferde basılabilecek makul üst sınır
}

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: {
    kind?: string;
    orders?: string;
    shipments?: string;
    template?: string;
  };
}) {
  const user = await requirePage(ALL_ROLES, "documents.view");

  const kindParsed = LabelTemplateKindEnum.safeParse(searchParams.kind);
  if (!kindParsed.success) redirect("/403");
  const kind = kindParsed.data;

  const orderIds = ids(searchParams.orders);
  const shipmentIds = ids(searchParams.shipments);

  const template = await resolveLabelTemplate(kind, searchParams.template);

  // Kimin neyi basabildiği tek yerde: süper adminde üç alan da boş kalır ve
  // kontrol atlanır, diğerlerinde kendi kapsamı uygulanır.
  const scope = {
    companyId:
      user.role === "COMPANY_ADMIN" || user.role === "COMPANY_STAFF"
        ? user.companyId
        : null,
    salesRepId: user.role === "SALES_REP" ? user.id : null,
    courierId: user.role === "COURIER" ? user.id : null,
  };

  // Sipariş fişi siparişten, etiket ve teslim fişi sevkiyattan beslenir.
  //
  // Sayfaların `withAuthErrors` sarmalayıcısı yok; yakalamazsak kullanıcı 403
  // yerine çökme sayfası görür (bkz. portal-context.ts'deki aynı gerekçe).
  let sheets;
  try {
    if (shipmentIds.length > 0) {
      await assertShipmentsPrintable(shipmentIds, scope);
      sheets = await buildShipmentLabelData(shipmentIds);
    } else {
      await assertOrdersPrintable(orderIds, scope);
      sheets = await buildOrderLabelData(orderIds);
    }
  } catch (e) {
    if (e instanceof BusinessError) redirect("/403");
    throw e;
  }

  return (
    <div className="min-h-screen bg-neutral-100 py-4 print:bg-white print:py-0">
      {/*
        Kâğıt ölçüsü şablondan: 80 mm rulo ile 100 mm etiket aynı ayarla
        basılamaz. Yükseklik yoksa "auto" — rulo içerik kadar uzar.
      */}
      <style>{`
        @page { size: ${template.widthMm}mm ${
          template.heightMm ? `${template.heightMm}mm` : "auto"
        }; margin: 3mm; }
        @media print {
          .no-print { display: none !important; }
          .label-page { break-after: page; }
          .label-page:last-child { break-after: auto; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4">
        <div>
          <h1 className="text-lg font-semibold">{template.name}</h1>
          <p className="text-sm text-neutral-500">
            {sheets.length} adet · {template.widthMm} mm
          </p>
        </div>
        <PrintButton />
      </div>

      {sheets.length === 0 ? (
        <p className="no-print px-4 text-center text-sm text-neutral-500">
          Basılacak kayıt seçilmedi.
        </p>
      ) : (
        <div className="mx-auto flex w-fit flex-col gap-4 print:gap-0">
          {sheets.map((data) => (
            <div
              key={data.key}
              className="bg-white p-2 shadow print:p-0 print:shadow-none"
            >
              <LabelSheet template={template} data={data} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
