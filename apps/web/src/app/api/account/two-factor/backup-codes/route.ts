import { regenerateBackupCodes } from "@repo/services";
import { twoFactorCodeSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { requestMeta } from "@/lib/request-meta";
import { parseBody } from "@/lib/validate";

// POST /api/account/two-factor/backup-codes — yedek kodları yenile.
//
// Geçerli bir kod ister: açık bir oturum tek başına yeni yedek kod almaya
// yetmemeli, yoksa telefonu olmayan biri de kendine kalıcı bir giriş yolu
// açabilirdi.
//
// Yenileme eskileri **geçersiz kılar**. Kısmi yenileme (kalanların üstüne
// ekleme) olmadığı için kullanıcı listenin tamamını yeniden yazmak zorunda —
// ama karşılığında "hangi kâğıt güncel" sorusu hiç doğmuyor.
export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser();
    const { code } = await parseBody(req, twoFactorCodeSchema);
    const { backupCodes } = await regenerateBackupCodes(
      user.id,
      code,
      requestMeta(),
    );
    return Response.json({ backupCodes });
  });
}
