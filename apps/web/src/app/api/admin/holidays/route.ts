import type { NextRequest } from "next/server";
import { listHolidays, saveHoliday, suggestFixed } from "@repo/services";
import { saveHolidaySchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET  /api/admin/holidays?yil= — bir yılın tatilleri + sabit tarihli öneriler.
// POST /api/admin/holidays      — gün ekle/güncelle (aynı güne ikinci kayıt üzerine yazar).
//
// İzin `organization.manage`: takvim bir kuruluş ayarı, bir rapor değil.
// Panonun `analytics.view`i **okumaya bile** yetmiyor, çünkü burada değişen
// şey ay sonu tahmini — sayıyı okuyan ile takvimi kuran aynı kişi olmak
// zorunda değil.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "organization.manage");
    const raw = Number(new URL(req.url).searchParams.get("yil"));
    const year =
      Number.isInteger(raw) && raw >= 2000 && raw <= 2100
        ? raw
        : new Date().getFullYear();
    return Response.json({
      year,
      holidays: await listHolidays(year),
      suggestions: suggestFixed(year),
    });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "organization.manage");
    const input = await parseBody(req, saveHolidaySchema);
    return Response.json({ holiday: await saveHoliday(input, user.id) });
  });
}
