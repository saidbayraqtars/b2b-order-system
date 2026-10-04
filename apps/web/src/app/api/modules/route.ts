import { getDisabledModules } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/modules — bu kurulumda kapalı modüller.
//
// Oturumu olan herkes okuyabilir: liste bir sır değil, gezinmenin hangi
// satırları göstereceği. İzinle açılan satırlar zaten süzülmüş geliyor; bu uç
// yalnızca paylaşılan izinle açılan satırlar için (portaldaki "Ziyaret" gibi).
export function GET() {
  return withAuthErrors(async () => {
    await requireUser();
    return Response.json({ disabled: await getDisabledModules() });
  });
}
