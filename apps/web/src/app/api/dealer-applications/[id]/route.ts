import type { NextRequest } from "next/server";
import { decideDealerApplication, getDealerApplication } from "@repo/services";
import { dealerApplicationDecisionSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { requestMeta } from "@/lib/request-meta";
import { parseBody } from "@/lib/validate";

// Tek başvuru: oku ve karara bağla.
//
// Onay ile ret aynı POST'tan geçiyor (gövdedeki `decision` ayırıyor), çünkü
// ikisi aynı geçişin iki yönü: bekleyen bir başvuruyu kapatmak. Ayrı uçlar
// olsaydı "zaten karar verilmiş" kontrolü iki yerde yaşardı.

export function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "applications.manage");
    return Response.json({ application: await getDealerApplication(params.id) });
  });
}

export function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "applications.manage");
    const input = await parseBody(req, dealerApplicationDecisionSchema);

    const application = await decideDealerApplication(params.id, input, {
      userId: user.id,
      email: user.email,
      role: user.role,
      meta: requestMeta(),
    });
    return Response.json({ application });
  });
}
