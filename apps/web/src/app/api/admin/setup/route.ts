import { applySetupPack, getSetupStatus, listSetupPacks } from "@repo/services";
import { z } from "zod";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET  /api/admin/setup      — kurulumun canlı durumu + hazır paketler
// POST /api/admin/setup      — bir sektör paketini uygular (tekrar edilebilir)
//
// Paket uygulamak kurulum verisi yazar (grup, kategori, vade, depo, kasa), yani
// `organization.manage` kapısının arkasında: firma yöneticisinin ya da
// muhasebenin bir düğmeyle kategori ağacı açması istenmez.

const applyPackSchema = z.object({
  pack: z.string().min(1),
});

export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "organization.manage");
    const [status, packs] = await Promise.all([
      getSetupStatus(),
      Promise.resolve(listSetupPacks()),
    ]);
    return Response.json({ status, packs });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "organization.manage");
    const { pack } = await parseBody(req, applyPackSchema);
    const report = await applySetupPack(pack);
    // Durum da dönüyor: ekran paketten sonra listeyi ikinci bir istek
    // atmadan tazeliyor.
    return Response.json({ report, status: await getSetupStatus() });
  });
}
