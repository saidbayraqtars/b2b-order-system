import type { NextRequest } from "next/server";
import {
  applyImport,
  buildXlsx,
  importTemplateRows,
  planImport,
  recordAudit,
  XLSX_CONTENT_TYPE,
  type ImportKind,
} from "@repo/services";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";

// Toplu fiyat / stok içe aktarma.
//
// Üç iş tek uçta çünkü üçü aynı akışın adımları ve aynı izne bağlı:
//   GET   → şablon (mevcut hâl, üzerine yazılacak)
//   POST ?mode=preview → fark önizlemesi
//   POST ?mode=apply   → uygula (önizlemenin imzasıyla)
//
// **Önizlemesiz uygulama yok** ve bu kural sunucuda duruyor, ekranda değil:
// `apply` bir imza istiyor, imzayı da yalnızca sunucunun kendi hesapladığı fark
// üretebiliyor. İmzasız ya da eski imzalı bir istek 409 alıyor.

const KINDS: ImportKind[] = ["PRICE", "STOCK"];

function kindOf(raw: string | null): ImportKind {
  return KINDS.includes(raw as ImportKind) ? (raw as ImportKind) : "PRICE";
}

/** Şablon: mevcut fiyat/stok, üzerine yazılmak üzere. */
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "pricing.manage");
    const kind = kindOf(new URL(req.url).searchParams.get("kind"));
    const rows = await importTemplateRows(kind);

    const columns =
      kind === "PRICE"
        ? [
            { label: "SKU" },
            { label: "Ürün" },
            { label: "Grup" },
            { label: "Min adet" },
            { label: "Fiyat" },
          ]
        : [{ label: "SKU" }, { label: "Ürün" }, { label: "Sayılan stok" }];

    const body =
      kind === "PRICE"
        ? rows.map((r) => [r.sku, r.productName, r.groupName, r.minQuantity, r.price])
        : rows.map((r) => [r.sku, r.productName, r.stock]);

    const file = buildXlsx(
      kind === "PRICE" ? "Fiyat listesi" : "Stok sayımı",
      columns,
      body,
    );
    return new Response(file as BodyInit, {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": `attachment; filename="${
          kind === "PRICE" ? "fiyat-listesi" : "stok-sayimi"
        }.xlsx"`,
      },
    });
  });
}

export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "pricing.manage");
    const { searchParams } = new URL(req.url);
    const kind = kindOf(searchParams.get("kind"));
    const mode = searchParams.get("mode") === "apply" ? "apply" : "preview";

    // Stok içe aktarma defteri oynatıyor; fiyat izni tek başına yetmiyor.
    if (kind === "STOCK") {
      await requireUser(["SUPER_ADMIN"], "stock.manage");
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof Blob)) {
      throw new InputError("Dosya gönderilmedi.");
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new InputError("Dosya 8 MB'tan büyük olamaz.");
    }
    const buffer = Buffer.from(await file.arrayBuffer());

    if (mode === "preview") {
      return Response.json({ plan: await planImport(kind, buffer) });
    }

    const signature = String(form?.get("signature") ?? "");
    if (!signature) {
      throw new InputError("Önizleme imzası eksik — önce önizleme alın.");
    }

    const result = await applyImport(kind, buffer, signature, user.id);

    // Kim, kaç satır, hangi dosya. Bir zam listesinin kime ait olduğu ancak
    // burada kalıyor: fiyat satırının kendisi kimin değiştirdiğini taşımıyor.
    await recordAudit({
      actor: user,
      action: kind === "PRICE" ? "PRICES_IMPORTED" : "STOCK_IMPORTED",
      entity: "BulkImport",
      summary:
        kind === "PRICE"
          ? `${result.applied} fiyat satırı güncellendi`
          : `${result.applied} varyantta sayım farkı işlendi`,
      meta: {
        kind,
        applied: result.applied,
        skipped: result.skipped,
        fileName: file instanceof File ? file.name : null,
        fileSize: file.size,
        signature,
      },
    });

    return Response.json({ result });
  });
}
