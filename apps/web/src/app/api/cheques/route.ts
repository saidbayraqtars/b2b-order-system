import type { NextRequest } from "next/server";
import { getChequeSummary, listCheques } from "@repo/services";
import { ChequeKindEnum, ChequeStatusEnum } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/cheques — çek/senet portföyü + özet.
//
// Tek uç iki şeyi birden döndürüyor: ekranın üstündeki toplamlar ile listenin
// kendisi her zaman birlikte gösteriliyor ve iki ayrı istek, ikisinin farklı
// anların fotoğrafı olması demekti.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "cheques.manage");

    const q = new URL(req.url).searchParams;
    const status = ChequeStatusEnum.safeParse(q.get("status"));
    const kind = ChequeKindEnum.safeParse(q.get("kind"));
    const companyId = q.get("companyId");

    const [cheques, summary] = await Promise.all([
      listCheques({
        ...(status.success ? { status: status.data } : {}),
        ...(kind.success ? { kind: kind.data } : {}),
        ...(companyId ? { companyId } : {}),
        ...(q.get("overdue") === "1" ? { overdueOnly: true } : {}),
      }),
      getChequeSummary(),
    ]);

    return Response.json({ cheques, summary });
  });
}
