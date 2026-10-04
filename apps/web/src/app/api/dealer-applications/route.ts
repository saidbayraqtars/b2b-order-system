import type { NextRequest } from "next/server";
import { listDealerApplications, submitDealerApplication, isModuleEnabled } from "@repo/services";
import { DealerApplicationStatusEnum, dealerApplicationSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { requestMeta } from "@/lib/request-meta";
import { parseBody } from "@/lib/validate";

// Bayi başvuruları.
//
// İki ucun yetkisi bilerek taban tabana zıt:
//
//   POST — **herkese açık.** Başvuran henüz kimse değil; oturumu, hesabı,
//          firması yok. Kapıyı kapatmak, kapının kendisini kaldırmak olurdu.
//          Freni servis tutuyor (adres başına saatlik sınır) ve cevap her
//          durumda aynı — form, kayıtlı e-postaları sorgulayan bir araca
//          dönüşmesin diye (bkz. dealer-application.ts).
//
//   GET  — `applications.manage`. Liste, ziyaretçilerin ünvanı, vergi
//          numarası, telefonu ve e-postası demek: müşteri adayı listesi.

export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "applications.manage");

    const status = DealerApplicationStatusEnum.safeParse(
      new URL(req.url).searchParams.get("status"),
    );
    const applications = await listDealerApplications(
      status.success ? { status: status.data } : {},
    );
    return Response.json({ applications });
  });
}

export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    // Modül kapalıysa form da yok; doğrudan gelen istek "bulunamadı" alır.
    if (!(await isModuleEnabled("basvuru"))) {
      return Response.json({ error: "Bulunamadı" }, { status: 404 });
    }
    const input = await parseBody(req, dealerApplicationSchema);
    await submitDealerApplication(input, requestMeta());

    // Tek cevap, tek metin. Kaydedildi mi, yinelenen olduğu için düştü mü,
    // hız sınırına mı takıldı — dışarıdan ayırt edilemez.
    return Response.json(
      {
        ok: true,
        message:
          "Başvurunuz alındı. Değerlendirme sonucunu e-posta ile bildireceğiz.",
      },
      { status: 202 },
    );
  });
}
