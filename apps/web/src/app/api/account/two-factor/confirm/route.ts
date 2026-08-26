import { confirmTwoFactorEnrollment } from "@repo/services";
import { twoFactorCodeSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { requestMeta } from "@/lib/request-meta";
import { parseBody } from "@/lib/validate";

// POST /api/account/two-factor/confirm — kurulumu kodla doğrula ve aç.
//
// Ayrı uç, çünkü ayrı bir istek: kullanıcı QR'ı okuttuktan sonra uygulamadaki
// kodu yazacak. POST /two-factor'ün yanıtına kodu iliştirmek, anahtarı
// istemcide taşıyıp geri göndermek demek olurdu — o hâlde doğrulanmamış bir
// anahtar istemci tarafından değiştirilebilirdi.
//
// Yanıt yedek kodları **bir kez** taşır; sunucuda yalnızca özetleri kalır.
export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(undefined, undefined, { twoFactorGate: false });
    const { code } = await parseBody(req, twoFactorCodeSchema);
    const { backupCodes } = await confirmTwoFactorEnrollment(
      user.id,
      code,
      requestMeta(),
    );
    // Açılış tokenVersion'ı artırdı: bu oturum da öldü. İstemci kodları
    // gösterdikten sonra kullanıcıyı girişe yollamalı.
    return Response.json({ backupCodes, sessionRevoked: true });
  });
}
