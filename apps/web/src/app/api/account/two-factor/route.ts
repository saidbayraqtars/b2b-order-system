import {
  beginTwoFactorEnrollment,
  disableTwoFactor,
  twoFactorStatus,
} from "@repo/services";
import { twoFactorCodeSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { requestMeta } from "@/lib/request-meta";
import { parseBody } from "@/lib/validate";

// GET    /api/account/two-factor — kendi ikinci adım durumun.
// POST   /api/account/two-factor — kurulumu başlat (QR + elle giriş anahtarı).
// DELETE /api/account/two-factor — kapat (geçerli kod ister).
//
// Hepsi **kendi** hesabı üzerinde: kimlik doğrulanmış oturumdan geliyor, gövdede
// hedef kullanıcı alanı yok. Başkasının ikinci adımına dokunmak ayrı bir uç
// (admin/users/[id]/two-factor) ve ayrı bir izin.
//
// Bu üç uç ikinci adım kapısından **muaf** (twoFactorGate: false): zorunlu
// kapsamdaki bir kullanıcı 2FA'sını buradan kuracak. Kapı burada da çalışsaydı,
// kurulum ekranı kendi ön koşulunu bekler ve hesap kalıcı olarak kilitlenirdi.
const OPEN_DURING_SETUP = { twoFactorGate: false } as const;

export function GET() {
  return withAuthErrors(async () => {
    const user = await requireUser(undefined, undefined, OPEN_DURING_SETUP);
    return Response.json({ twoFactor: await twoFactorStatus(user.id) });
  });
}

export function POST() {
  return withAuthErrors(async () => {
    const user = await requireUser(undefined, undefined, OPEN_DURING_SETUP);
    // Yanıt anahtarı düz metin taşır — bir kez, kurulum anında, yalnızca
    // hesabın kendi oturumuna. Saklanan kopya şifreli (secret-box).
    return Response.json({ enrollment: await beginTwoFactorEnrollment(user.id) });
  });
}

export function DELETE(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(undefined, undefined, OPEN_DURING_SETUP);
    const { code } = await parseBody(req, twoFactorCodeSchema);
    await disableTwoFactor(user.id, code, requestMeta());
    // Kapatma da tüm oturumları düşürür (tokenVersion arttı): istemci giriş
    // ekranına dönmeli, yoksa bir sonraki isteğinde sebepsiz 401 görür.
    return Response.json({ ok: true, sessionRevoked: true });
  });
}
