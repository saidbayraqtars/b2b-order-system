import { Prisma, prisma } from "@repo/database";
import type { ReconciliationStatus } from "@repo/types";
import { BusinessError } from "./errors";
import { Dec } from "./money";

// Cari mutabakat — dönem sonu ritüeli.
//
// Mektup gider, müşteri "mutabıkım" ya da "itirazım var" der. Defter
// (`Transaction`) zaten tam ve ekstre ekranı zaten vardı; eksik olan **belge ve
// onay akışı**ydı: muhasebenin yılda iki kez elle yaptığı iş.
//
// Üç kural:
//
//  1. **Bakiye anlık görüntü.** Defter işlemeye devam ediyor, mektup bir ana
//     ait. Bugünkü bakiyeyi gösteren bir mutabakat, dün imzalanmış bir kâğıdı
//     bugün değiştirmek olurdu.
//  2. **Cevap defteri oynatmaz.** "Mutabıkım" bir beyan, bir işlem değil.
//     İtiraz da bir düzeltme değil, bir konuşmanın başlangıcı — düzeltmeyi
//     insan yapar ve defterde kendi satırını açar.
//  3. **Bir dönem, bir firma, bir açık mektup.** İkincisi ancak ilki iptal
//     edilerek gönderilir.

export interface ReconciliationRow {
  id: string;
  companyId: string;
  companyName: string;
  periodStart: string;
  periodEnd: string;
  balance: string;
  totalDebit: string;
  totalCredit: string;
  asOf: string;
  status: ReconciliationStatus;
  responseNote: string | null;
  respondedByName: string | null;
  respondedAt: string | null;
  createdByName: string | null;
  createdAt: string;
  /** Bugünkü bakiye — mektuptaki ile karşılaştırmak için. */
  currentBalance: string;
}

const ROW_SELECT = {
  id: true,
  companyId: true,
  periodStart: true,
  periodEnd: true,
  balance: true,
  totalDebit: true,
  totalCredit: true,
  asOf: true,
  status: true,
  responseNote: true,
  respondedAt: true,
  createdAt: true,
  respondedBy: { select: { name: true } },
  createdBy: { select: { name: true } },
  company: { select: { name: true, currentBalance: true } },
} satisfies Prisma.ReconciliationSelect;

type Row = Prisma.ReconciliationGetPayload<{ select: typeof ROW_SELECT }>;

function toRow(r: Row): ReconciliationRow {
  return {
    id: r.id,
    companyId: r.companyId,
    companyName: r.company.name,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    balance: r.balance.toFixed(2),
    totalDebit: r.totalDebit.toFixed(2),
    totalCredit: r.totalCredit.toFixed(2),
    asOf: r.asOf.toISOString(),
    status: r.status,
    responseNote: r.responseNote,
    respondedByName: r.respondedBy?.name ?? null,
    respondedAt: r.respondedAt?.toISOString() ?? null,
    createdByName: r.createdBy?.name ?? null,
    createdAt: r.createdAt.toISOString(),
    currentBalance: r.company.currentBalance.toFixed(2),
  };
}

// ─────────────────────────────────────────────
// GÖNDERİM
// ─────────────────────────────────────────────

export interface SendReconciliationsInput {
  /** Dönem başlangıcı, `YYYY-MM-DD`. */
  from: string;
  /** Dönem sonu, `YYYY-MM-DD` (dahil). */
  to: string;
  /**
   * Hangi firmalara. Boş dizi = **hepsi**, aynı `Announcement` ve
   * `Company.allowedPaymentMethods` sözleşmesi: boş "kısıt yok" demek.
   */
  companyIds?: string[];
  /**
   * Bakiyesi sıfır olan firmaya da gönderilsin mi.
   *
   * Varsayılan hayır: "borcunuz 0,00 ₺, mutabık mısınız" diye bir mektup, alan
   * kişiye hiçbir şey sormuyor ve gönderene yüz cevapsız satır bırakıyor.
   */
  includeZeroBalance?: boolean;
}

export interface SendReconciliationsResult {
  created: number;
  /** Zaten açık mektubu olduğu için atlanan firmalar. */
  skippedOpen: number;
  /** Bakiyesi sıfır olduğu için atlananlar. */
  skippedZero: number;
}

/**
 * Takvim gününün **yerel** sınırları.
 *
 * UTC değil, ve bu bir tercih değil zorunluluk: mektup, müşterinin yan yana
 * koyacağı **ekstre** ile aynı günleri kapsamalı ve ekstre (`ledger.ts`) yerel
 * gün sınırlarıyla çalışıyor. UTC kullanılsaydı Türkiye'de dönem sonu üç saat
 * kayar, 1 Ağustos'un ilk üç saati Temmuz mutabakatına girerdi.
 *
 * Parçalardan kuruluyor (`new Date(y, m-1, d)`), dizgiden değil:
 * `new Date("2026-07-01")` UTC gece yarısı demek ve negatif ofsetli bir
 * kurulumda bir önceki güne düşer.
 */
function dayBounds(day: string): { start: Date; end: Date } {
  const [y, m, d] = day.split("-").map(Number);
  const start = new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const end = new Date(y!, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Dönem mektuplarını üretir.
 *
 * Bakiye **defterden** hesaplanıyor, `Company.currentBalance`ten değil: o kolon
 * bugünün bakiyesi ve mektup dönem sonuna ait. İkisi zaten farklı sayılar ve
 * mektuba yanlış olanı yazmak, mutabakatı anlamsız kılardı.
 */
export async function sendReconciliations(
  input: SendReconciliationsInput,
  actorId: string,
): Promise<SendReconciliationsResult> {
  const periodStart = dayBounds(input.from).start;
  const periodEnd = dayBounds(input.to).end;
  if (periodEnd <= periodStart) {
    throw new BusinessError(
      "INVALID_PERIOD",
      "Dönem sonu, dönem başından sonra olmalı.",
    );
  }

  const companies = await prisma.company.findMany({
    where: {
      isActive: true,
      ...(input.companyIds?.length ? { id: { in: input.companyIds } } : {}),
    },
    select: { id: true },
  });
  if (companies.length === 0) return { created: 0, skippedOpen: 0, skippedZero: 0 };

  const ids = companies.map((c) => c.id);

  // Açık mektubu olanlar — aynı döneme ikincisi gönderilmiyor.
  const open = await prisma.reconciliation.findMany({
    where: {
      companyId: { in: ids },
      periodEnd,
      status: { in: ["SENT", "AGREED", "DISPUTED"] },
    },
    select: { companyId: true },
  });
  const hasOpen = new Set(open.map((o) => o.companyId));

  // Dönem içi hareketler ve dönem öncesi bakiye, **iki toplu sorguda**: firma
  // başına ekstre çekmek yüz firmada iki yüz gidiş-dönüş olurdu.
  const [before, within] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["companyId", "type"],
      where: { companyId: { in: ids }, createdAt: { lt: periodStart } },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["companyId", "type"],
      where: {
        companyId: { in: ids },
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amount: true },
    }),
  ]);

  const sum = (
    rows: typeof before,
    companyId: string,
    type: "DEBIT" | "CREDIT",
  ) =>
    new Dec(
      rows.find((r) => r.companyId === companyId && r.type === type)?._sum
        .amount ?? 0,
    );

  let created = 0;
  let skippedZero = 0;
  const data: Prisma.ReconciliationCreateManyInput[] = [];

  for (const id of ids) {
    if (hasOpen.has(id)) continue;

    const opening = sum(before, id, "DEBIT").sub(sum(before, id, "CREDIT"));
    const debit = sum(within, id, "DEBIT");
    const credit = sum(within, id, "CREDIT");
    const balance = opening.add(debit).sub(credit);

    // Hiç hareketi olmayan **ve** bakiyesi sıfır olan firma atlanıyor.
    if (
      !input.includeZeroBalance &&
      balance.isZero() &&
      debit.isZero() &&
      credit.isZero()
    ) {
      skippedZero += 1;
      continue;
    }

    data.push({
      companyId: id,
      periodStart,
      periodEnd,
      balance,
      totalDebit: debit,
      totalCredit: credit,
      asOf: periodEnd,
      createdById: actorId,
    });
    created += 1;
  }

  if (data.length > 0) {
    await prisma.reconciliation.createMany({ data });
  }

  return { created, skippedOpen: hasOpen.size, skippedZero };
}

// ─────────────────────────────────────────────
// OKUMA
// ─────────────────────────────────────────────

export interface ListReconciliationsInput {
  status?: ReconciliationStatus;
  companyId?: string;
  limit?: number;
}

export async function listReconciliations(
  input: ListReconciliationsInput = {},
): Promise<ReconciliationRow[]> {
  const rows = await prisma.reconciliation.findMany({
    where: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.companyId ? { companyId: input.companyId } : {}),
    },
    select: ROW_SELECT,
    orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
    take: Math.min(input.limit ?? 200, 1000),
  });
  return rows.map(toRow);
}

export async function getReconciliation(
  id: string,
): Promise<ReconciliationRow | null> {
  const row = await prisma.reconciliation.findUnique({
    where: { id },
    select: ROW_SELECT,
  });
  return row ? toRow(row) : null;
}

// ─────────────────────────────────────────────
// CEVAP
// ─────────────────────────────────────────────

export interface RespondInput {
  id: string;
  agreed: boolean;
  /** İtirazda **zorunlu**: gerekçesiz bir itiraz cevaplanamaz. */
  note?: string | null;
}

/**
 * Müşterinin cevabı.
 *
 * Yalnızca `SENT` hâlindeki mektup cevaplanabiliyor: verilmiş bir cevabı
 * değiştirmek, imzalanmış bir kâğıdı geri almak olurdu. Fikir değiştiren
 * müşteriye yeni bir mektup gönderiliyor.
 *
 * Firma kontrolü **burada değil**, çağıran katmanda (`resolveCompanyId`):
 * servis kimin çağırdığını bilmiyor ve bilmemeli.
 */
export async function respondToReconciliation(
  input: RespondInput,
  userId: string,
): Promise<ReconciliationRow> {
  const note = input.note?.trim() || null;
  if (!input.agreed && !note) {
    throw new BusinessError(
      "INVALID_RESPONSE",
      "İtiraz gerekçesiz olamaz — hangi kalemde anlaşamadığınızı yazın.",
    );
  }

  const result = await prisma.reconciliation.updateMany({
    where: { id: input.id, status: "SENT" },
    data: {
      status: input.agreed ? "AGREED" : "DISPUTED",
      responseNote: note,
      respondedById: userId,
      respondedAt: new Date(),
    },
  });
  if (result.count === 0) {
    throw new BusinessError(
      "INVALID_STATE",
      "Bu mutabakat zaten cevaplanmış ya da iptal edilmiş.",
    );
  }

  const row = await getReconciliation(input.id);
  return row!;
}

/**
 * Satıcı mektubu geri çekiyor — yanlış dönem, yanlış firma.
 *
 * Cevaplanmış mektup iptal edilemiyor: müşterinin beyanını satıcının silmesi,
 * mutabakatın taşıdığı tek şeyi (karşı tarafın sözünü) yok ederdi.
 */
export async function cancelReconciliation(
  id: string,
  actorId: string,
): Promise<void> {
  const result = await prisma.reconciliation.updateMany({
    where: { id, status: "SENT" },
    data: { status: "CANCELLED", respondedById: actorId, respondedAt: new Date() },
  });
  if (result.count === 0) {
    throw new BusinessError(
      "INVALID_STATE",
      "Yalnızca cevaplanmamış bir mutabakat iptal edilebilir.",
    );
  }
}

// ─────────────────────────────────────────────
// ÖZET
// ─────────────────────────────────────────────

export interface ReconciliationSummary {
  sent: number;
  agreed: number;
  disputed: number;
  cancelled: number;
  /** İtiraz edilen mektupların bakiye toplamı — konuşulacak paranın büyüklüğü. */
  disputedAmount: string;
}

export async function getReconciliationSummary(): Promise<ReconciliationSummary> {
  const [counts, disputed] = await Promise.all([
    prisma.reconciliation.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.reconciliation.aggregate({
      where: { status: "DISPUTED" },
      _sum: { balance: true },
    }),
  ]);
  const of = (s: ReconciliationStatus) =>
    counts.find((c) => c.status === s)?._count._all ?? 0;

  return {
    sent: of("SENT"),
    agreed: of("AGREED"),
    disputed: of("DISPUTED"),
    cancelled: of("CANCELLED"),
    disputedAmount: new Dec(disputed._sum.balance ?? 0).toFixed(2),
  };
}
