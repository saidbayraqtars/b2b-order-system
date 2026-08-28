import { prisma } from "@repo/database";
import type { CollectionOutcome } from "@repo/types";
import { BusinessError } from "./errors";
import { Dec } from "./money";
import { getReceivables } from "./ledger";

// Tahsilat çalışma listesi — "bugün kimi arayacağım".
//
// FIFO yaşlandırma Adım 8'de gelmişti ve "kim ne kadar borçlu" sorusunu
// cevaplıyordu. Plasiyerin sabah sorduğu soru ise başka: **sırada kim var.**
// Aradaki fark aramanın **sonucu**: dün arayıp "15'inde ödeyeceğim" diyen
// müşteri, sonuç hiçbir yerde durmadığı için bugün yine listenin başındaydı.
//
// Liste bu yüzden yaşlandırma + son arama üzerine kuruluyor ve sırayı borç
// büyüklüğü değil **durum** belirliyor.

/**
 * Bir carinin listedeki hâli. Sıra bu değerin kendisinden çıkıyor.
 */
export type WorklistState =
  /** Söz verilen gün geldi ya da geçti, para gelmedi — listenin başı. */
  | "PROMISE_DUE"
  /** Ulaşılamadı; tekrar denenecek. */
  | "UNREACHABLE"
  /** Hiç aranmamış. */
  | "NEVER_CALLED"
  /** Görüşüldü ama söz alınamadı. */
  | "NO_PROMISE"
  /** Ödemeyi reddetti — bu artık bir tahsilat aramasının konusu değil. */
  | "REFUSED"
  /** Söz verilen gün henüz gelmedi — **aranmayacak.** */
  | "PROMISE_PENDING";

/** Sıra: küçük olan üstte. */
const STATE_ORDER: Record<WorklistState, number> = {
  PROMISE_DUE: 0,
  UNREACHABLE: 1,
  NEVER_CALLED: 2,
  NO_PROMISE: 3,
  REFUSED: 4,
  PROMISE_PENDING: 5,
};

export interface WorklistRow {
  companyId: string;
  companyName: string;
  phone: string | null;
  salesRepId: string | null;
  salesRepName: string | null;
  /** Vadesi geçmiş toplam. */
  overdue: string;
  /** Toplam bakiye — vadesi gelmemişi de kapsıyor. */
  balance: string;
  /** En eski açık borcun vade tarihi. */
  oldestDueDate: string | null;
  /** O vadenin üstünden geçen gün; vadesi geçmemişse 0. */
  daysOverdue: number;
  state: WorklistState;
  lastCall: {
    at: string;
    outcome: CollectionOutcome;
    note: string | null;
    calledByName: string | null;
    promisedDate: string | null;
    promisedAmount: string | null;
  } | null;
}

export interface CollectionWorklist {
  rows: WorklistRow[];
  /** Bugün aranacak satır sayısı — `PROMISE_PENDING` dışındakiler. */
  actionable: number;
  /** Vadesi geçmiş toplam tutar. */
  overdueTotal: string;
  /** Sözü geçmiş tutar — verilen sözlerin tutmadığı para. */
  brokenPromiseTotal: string;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

/** Bir tarihin gün başı — söz karşılaştırması saat değil gün meselesi. */
function dayStart(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export interface WorklistInput {
  /** Plasiyerin kendi portföyü. Verilmezse tüm cariler (yönetici görünümü). */
  salesRepId?: string;
  /** Bu tutarın altındaki borç listeye girmiyor. Varsayılan 0,01 — yani sıfır hariç. */
  minOverdue?: number;
  asOf?: Date;
}

/**
 * Aranacaklar listesi.
 *
 * **Vadesi geçmemiş cari listeye girmiyor**: tahsilat araması bir borç
 * hatırlatması ve vadesi gelmemiş borcu hatırlatmak müşteriyi kızdırmaktan
 * başka bir işe yaramaz.
 *
 * Sözü **henüz gelmemiş** cari listede kalıyor ama en altta ve `PROMISE_PENDING`
 * olarak: listeden tamamen çıkarmak, "ben o adama söz verdirmiştim" diyen
 * plasiyerin sözü nerede olduğunu göremediği bir liste olurdu.
 */
export async function getCollectionWorklist(
  input: WorklistInput = {},
): Promise<CollectionWorklist> {
  const asOf = input.asOf ?? new Date();
  const today = dayStart(asOf);
  const min = new Dec(input.minOverdue ?? 0.01);

  const receivables = await getReceivables({
    salesRepId: input.salesRepId,
    asOf,
  });
  const candidates = receivables.companies.filter((c) =>
    new Dec(c.overdue).gte(min),
  );
  if (candidates.length === 0) {
    return {
      rows: [],
      actionable: 0,
      overdueTotal: "0.00",
      brokenPromiseTotal: "0.00",
    };
  }

  const ids = candidates.map((c) => c.companyId);

  // Son arama **tek sorguda**: firma başına `findFirst`, elli carilik bir
  // portföyde elli gidiş-dönüş olurdu. En yeniden eskiye alıp ilk görüleni
  // tutuyoruz.
  const calls = await prisma.collectionCall.findMany({
    where: { companyId: { in: ids } },
    orderBy: { createdAt: "desc" },
    select: {
      companyId: true,
      createdAt: true,
      outcome: true,
      note: true,
      promisedDate: true,
      promisedAmount: true,
      calledBy: { select: { name: true } },
    },
  });
  const lastByCompany = new Map<string, (typeof calls)[number]>();
  for (const c of calls) {
    if (!lastByCompany.has(c.companyId)) lastByCompany.set(c.companyId, c);
  }

  const phones = await prisma.company.findMany({
    where: { id: { in: ids } },
    select: { id: true, phone: true },
  });
  const phoneById = new Map(phones.map((p) => [p.id, p.phone]));

  const rows: WorklistRow[] = candidates.map((c) => {
    const call = lastByCompany.get(c.companyId) ?? null;

    let state: WorklistState;
    if (!call) {
      state = "NEVER_CALLED";
    } else if (call.outcome === "PROMISED" || call.outcome === "CHEQUE") {
      // Söz günü geldi mi. Gelmediyse aranmayacak; geldiyse listenin başı.
      state =
        call.promisedDate && dayStart(call.promisedDate) > today
          ? "PROMISE_PENDING"
          : "PROMISE_DUE";
    } else if (call.outcome === "UNREACHABLE") {
      state = "UNREACHABLE";
    } else if (call.outcome === "REFUSED") {
      state = "REFUSED";
    } else {
      state = "NO_PROMISE";
    }

    return {
      companyId: c.companyId,
      companyName: c.companyName,
      phone: phoneById.get(c.companyId) ?? null,
      salesRepId: c.salesRepId,
      salesRepName: c.salesRepName,
      overdue: c.overdue,
      balance: c.balance,
      oldestDueDate: c.oldestDueDate,
      daysOverdue: c.oldestDueDate
        ? daysBetween(new Date(c.oldestDueDate), asOf)
        : 0,
      state,
      lastCall: call
        ? {
            at: call.createdAt.toISOString(),
            outcome: call.outcome,
            note: call.note,
            calledByName: call.calledBy?.name ?? null,
            promisedDate: call.promisedDate?.toISOString() ?? null,
            promisedAmount: call.promisedAmount?.toFixed(2) ?? null,
          }
        : null,
    };
  });

  // Durum önce, sonra tutar. Aynı durumdaki iki cari arasında büyük olan
  // önce gelir; ama hiç aranmamış küçük bir borç, sözü tutmamış büyük bir
  // borcun önüne **geçmez**.
  rows.sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      Number(b.overdue) - Number(a.overdue),
  );

  const brokenPromiseTotal = rows
    .filter((r) => r.state === "PROMISE_DUE")
    .reduce((sum, r) => sum.add(r.overdue), new Dec(0));

  return {
    rows,
    actionable: rows.filter((r) => r.state !== "PROMISE_PENDING").length,
    overdueTotal: rows
      .reduce((sum, r) => sum.add(r.overdue), new Dec(0))
      .toFixed(2),
    brokenPromiseTotal: brokenPromiseTotal.toFixed(2),
  };
}

// ─────────────────────────────────────────────
// ARAMA KAYDI
// ─────────────────────────────────────────────

export interface RecordCallInput {
  companyId: string;
  outcome: CollectionOutcome;
  /** `YYYY-MM-DD`; `PROMISED` ve `CHEQUE` için **zorunlu**. */
  promisedDate?: string | null;
  promisedAmount?: number | null;
  note?: string | null;
}

/**
 * Arama sonucunu yazar.
 *
 * Söz veren müşteride tarih zorunlu: tarihsiz bir söz listeyi hiç
 * değiştirmezdi — "ödeyeceğim" diyen ama ne zaman demeyen müşteri, yarın yine
 * aranacak biri.
 *
 * Firma yetkisi burada değil, çağıran katmanda (`resolveCompanyId`).
 */
export async function recordCollectionCall(
  input: RecordCallInput,
  userId: string,
): Promise<{ id: string }> {
  const needsDate = input.outcome === "PROMISED" || input.outcome === "CHEQUE";
  if (needsDate && !input.promisedDate) {
    throw new BusinessError(
      "INVALID_RESPONSE",
      "Söz verilen tarih olmadan söz kaydedilemez — hangi gün ödeneceğini yazın.",
    );
  }

  const [y, m, d] = (input.promisedDate ?? "").split("-").map(Number);
  const promisedDate =
    needsDate && y ? new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0) : null;

  const row = await prisma.collectionCall.create({
    data: {
      companyId: input.companyId,
      outcome: input.outcome,
      promisedDate,
      promisedAmount: input.promisedAmount ?? null,
      note: input.note?.trim() || null,
      calledById: userId,
    },
    select: { id: true },
  });
  return row;
}

export interface CallHistoryRow {
  id: string;
  at: string;
  outcome: CollectionOutcome;
  promisedDate: string | null;
  promisedAmount: string | null;
  note: string | null;
  calledByName: string | null;
}

/** Bir carinin arama geçmişi — en yeniden eskiye. */
export async function listCollectionCalls(
  companyId: string,
  limit = 20,
): Promise<CallHistoryRow[]> {
  const rows = await prisma.collectionCall.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
    select: {
      id: true,
      createdAt: true,
      outcome: true,
      promisedDate: true,
      promisedAmount: true,
      note: true,
      calledBy: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    outcome: r.outcome,
    promisedDate: r.promisedDate?.toISOString() ?? null,
    promisedAmount: r.promisedAmount?.toFixed(2) ?? null,
    note: r.note,
    calledByName: r.calledBy?.name ?? null,
  }));
}
