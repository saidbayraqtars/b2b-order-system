import {
  updateNotificationPreferences,
} from "@repo/services";
import { notificationPreferencesSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { requestMeta } from "@/lib/request-meta";
import { parseBody } from "@/lib/validate";

// PUT /api/account/bildirimler — kendi bildirim tercihleri.
//
// Ayrı uç, `PATCH /api/account`in bir alanı değil: profil düzenlemesi kısmi
// güncelleme (verilen alan değişir), tercih ise **tam liste** — gönderilmeyen
// olay susturulmamış demek. İkisini tek uçta birleştirmek, "boş dizi" ile
// "gönderilmedi" ayrımını her çağrıda düşündürürdü.
export function PUT(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser();
    const input = await parseBody(req, notificationPreferencesSchema);
    const account = await updateNotificationPreferences(
      user.id,
      input.muted,
      requestMeta(),
    );
    return Response.json({ account });
  });
}
