import { isErpDiagnosticCommand, runErpDiagnostic } from "@repo/services";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";

// POST /api/admin/erp/command — ajana teşhis komutu.
//
// Adı istemci veriyor ama **listede olmayan ad geçmiyor**: bu uç genel bir
// "komut çalıştır" kapısı değil. Yazan komutlar buradan hiç çağrılamaz; bir
// belge, siparişinin kendi ekranındaki onaydan gider.
export function POST(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "erp.manage");
    const body: unknown = await req.json().catch(() => ({}));
    const command = (body as { command?: unknown }).command;
    if (!isErpDiagnosticCommand(command)) {
      throw new InputError("Bilinmeyen komut");
    }
    return Response.json({ command, result: await runErpDiagnostic(command) });
  });
}
