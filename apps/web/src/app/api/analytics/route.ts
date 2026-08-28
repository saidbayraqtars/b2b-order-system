import type { NextRequest } from "next/server";
import {
  liveStatus,
  pace,
  readSnapshot,
  type AnalyticsSnapshotPayload,
} from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/analytics?bolum= — yönetici panosunun tek ucu.
//
// Bölüm bazlı, çünkü ekranın sekmesi de bölüm bazlı: açılan sekmenin verisi
// iniyor, altı bölümün hepsi değil. "Durum" ve "gidişat" canlı sorgudan,
// diğer dördü gecelik özetten geliyor ve cevabın içinde **ne zaman
// hesaplandığı** da var — bayat olabilecek bir sayının yanında o tarih
// yazmadan gösterilmesi §6.5'in ihlali olurdu.
//
// İzin `analytics.view`, rol değil: maliyet ve marj bu ekranda ve `costPrice`
// müşteriye gösterilmiyor, plasiyere de gösterilmemeli.

type Section = "durum" | "buyume" | "musteri" | "urun" | "nakit" | "gidisat";

const SNAPSHOT_KEY: Partial<Record<Section, keyof AnalyticsSnapshotPayload>> = {
  buyume: "growth",
  musteri: "customers",
  urun: "products",
  nakit: "cash",
};

export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "analytics.view");

    const raw = new URL(req.url).searchParams.get("bolum") ?? "durum";
    const section = (raw as Section) in SNAPSHOT_KEY || raw === "durum" || raw === "gidisat"
      ? (raw as Section)
      : "durum";

    if (section === "durum") {
      return Response.json({
        section,
        live: true,
        computedAt: new Date().toISOString(),
        data: await liveStatus(),
      });
    }
    if (section === "gidisat") {
      return Response.json({
        section,
        live: true,
        computedAt: new Date().toISOString(),
        data: await pace(),
      });
    }

    const stored = await readSnapshot(SNAPSHOT_KEY[section]!);
    return Response.json({
      section,
      live: false,
      computedAt: stored.computedAt,
      data: stored.data,
    });
  });
}
