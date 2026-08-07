import type { NextRequest } from "next/server";
import {
  getCurrentRates,
  listExchangeRates,
  recordExchangeRate,
} from "@repo/services";
import { exchangeRateSchema } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";

// Döviz kuru.
//
// `pricing.manage` iznine bağlı, ayrı bir izin değil: kuru giren kişi ile liste
// fiyatını belirleyen kişi aynı sorunun iki yüzü — ikisi de müşteriden tahsil
// edilecek tutarı belirliyor. Ayrı izin, listeyi uzatıp ayrımı kimsenin
// istemediği bir yerde yapardı.

export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "pricing.manage");
    const [current, history] = await Promise.all([
      getCurrentRates(),
      listExchangeRates(undefined, 60),
    ]);
    return Response.json({ current, history });
  });
}

export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "pricing.manage");

    const json = await req.json().catch(() => null);
    const parsed = exchangeRateSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    const result = await recordExchangeRate(parsed.data, user.id);
    return Response.json(result, { status: 201 });
  });
}
