import { checkOut, closeVisitRequestsForCheckIn } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// POST /api/checkins/:id/checkout — close an open visit. Ownership (the rep who
// opened it) is enforced inside the service.
export function POST(_req: Request, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SALES_REP", "SUPER_ADMIN"], "visits.manage");
    const checkIn = await checkOut(params.id, user.id);

    // Ziyaret kapandığında o firmanın açık çağrısı da kapanır: plasiyerin aynı
    // işi iki kez işaretlemesi gerekmemeli, ve karşılanmış bir çağrı listede
    // durup "gelmediler" izlenimi vermemeli.
    await closeVisitRequestsForCheckIn(checkIn.companyId, checkIn.id);

    return Response.json({ checkIn });
  });
}
