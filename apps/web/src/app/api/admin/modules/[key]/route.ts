import { setModuleEnabled } from "@repo/services";
import { ModuleKeyEnum, setModuleSchema } from "@repo/types";
import { auditContext } from "@/lib/audit-context";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// PUT /api/admin/modules/kampanya { enabled } — modülü aç/kapat.
//
// `organization.manage` kendisi hiçbir modüle ait değil: bu ekranı kapatan bir
// modül olsaydı, kapatan kişi geri açacak kapıyı da kapatmış olurdu.
export function PUT(req: Request, { params }: { params: { key: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "organization.manage");
    const key = ModuleKeyEnum.safeParse(params.key);
    if (!key.success) throw new InputError("Bilinmeyen modül");
    const { enabled } = await parseBody(req, setModuleSchema);
    const updated = await setModuleEnabled(key.data, enabled, auditContext(user));
    return Response.json({ module: updated });
  });
}
