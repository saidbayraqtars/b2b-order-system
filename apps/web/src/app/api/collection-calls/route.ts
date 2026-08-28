import type { NextRequest } from "next/server";
import {
  getCollectionWorklist,
  listCollectionCalls,
  recordCollectionCall,
} from "@repo/services";
import { recordCollectionCallSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";
import { resolveCompanyId } from "@/lib/company-access";

const CALLERS = ["SALES_REP", "SUPER_ADMIN"] as const;

// GET  /api/collection-calls            → çalışma listesi
// GET  /api/collection-calls?companyId= → o carinin arama geçmişi
// POST /api/collection-calls            → arama sonucu
//
// Plasiyer **kendi portföyünü** görüyor, yönetici hepsini: kapsam rolden
// okunuyor, istemcinin gönderdiği bir alandan değil.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(CALLERS, "cash.manage");
    const requested = new URL(req.url).searchParams.get("companyId");

    if (requested) {
      const companyId = await resolveCompanyId(user, requested);
      return Response.json({ calls: await listCollectionCalls(companyId) });
    }

    const worklist = await getCollectionWorklist({
      salesRepId: user.role === "SALES_REP" ? user.id : undefined,
    });
    return Response.json({ worklist });
  });
}

export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(CALLERS, "cash.manage");
    const input = await parseBody(req, recordCollectionCallSchema);

    // Yanlış cariye arama kaydı, yanlış cariye tahsilattan ucuz ama yine de
    // yanlış: kapı aynı kapı.
    const companyId = await resolveCompanyId(user, input.companyId);

    const call = await recordCollectionCall({ ...input, companyId }, user.id);
    return Response.json({ call }, { status: 201 });
  });
}
