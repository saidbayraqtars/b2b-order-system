import type { NextRequest } from "next/server";
import { z } from "zod";
import { registerPushDevice, removePushDevice } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// Telefonun bildirim adresi.
//
// İzin gerektirmiyor, yalnızca oturum: bildirim almak bir yetki değil, hesabın
// kendi cihazına ait bir tercih. Kime ait olduğu da gövdeden değil **oturumdan**
// okunuyor — istemcinin verdiği bir kullanıcı kimliğine güvenmek, birinin
// bildirimlerini başkasının telefonuna yönlendirmesine izin verirdi.

const registerSchema = z.object({
  token: z.string().min(1).max(200),
  platform: z.enum(["android", "ios"]),
  deviceName: z.string().max(100).optional(),
});

const removeSchema = z.object({ token: z.string().min(1).max(200) });

// POST /api/mobile/push-token
export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser();
    const body = registerSchema.parse(await req.json());

    await registerPushDevice({
      userId: user.id,
      token: body.token,
      platform: body.platform,
      deviceName: body.deviceName ?? null,
    });

    return Response.json({ ok: true });
  });
}

// DELETE /api/mobile/push-token — çıkışta ya da bildirim kapatıldığında.
export function DELETE(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser();
    const body = removeSchema.parse(await req.json());

    await removePushDevice(user.id, body.token);

    return Response.json({ ok: true });
  });
}
