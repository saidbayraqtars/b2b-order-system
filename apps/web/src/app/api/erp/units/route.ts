import { ingestUnits } from "@repo/services";
import { erpUnitBatchSchema } from "@repo/types";
import { withAuthErrors } from "@/lib/guard";
import { requireAgent } from "@/lib/erp-guard";
import { parseBody } from "@/lib/validate";

// POST /api/erp/units — paket birimleri (koli, palet), ajandan.
//
// (Kalem, ERP birim kodu) ile eşlenir; tekrar gönderim aynı satırı günceller.
// Gönderilmeyen birim silinmez — ajan sayfa sayfa gönderiyor. Paket fiyatı
// ayrıca /api/erp/prices ile `unitCode` taşıyarak gelir.
export function POST(req: Request) {
  return withAuthErrors(async () => {
    const agent = await requireAgent(req);
    const { rows } = await parseBody(req, erpUnitBatchSchema);
    return Response.json(await ingestUnits(rows, agent.id));
  });
}
