import { type Prisma, prisma } from "@repo/database";
import {
  type ChequeActionInput,
  type ChequeDetailsInput,
  type ChequeFilterInput,
  type ChequeKind,
  type ChequeStatus,
  CHEQUE_TERMINAL_STATUSES,
  canTransition,
} from "@repo/types";
import { postCashMovement } from "./cash";
import { BusinessError } from "./errors";
import { Dec, round2 } from "./money";

type Tx = Prisma.TransactionClient;

// Çek/senet portföyü.
//
// Kâğıdın kendisi burada duruyor. İki kural her şeyi belirliyor:
//
//  1. **Kâğıt tahsilattan doğar.** Elle çek satırı açılamaz. Açılabilseydi
//     portföyde cariyi kapatmamış çekler birikirdi ve "müşteri ne kadar
//     borçlu" ile "elimde ne kadar kâğıt var" birbirini tutmazdı.
//  2. **Para vadesinde girer.** Tahsilat anında kasaya hiçbir şey yazılmıyor
//     (bkz. payment-terms.ts), kasa hareketi yalnızca CLEARED adımında
//     yazılıyor. Karşılıksız çıkarsa kapanan borç geri açılıyor.

// ─────────────────────────────────────────────
// OLUŞTURMA (yalnızca tahsilattan)
// ─────────────────────────────────────────────

export interface CreateChequeContext {
  transactionId: string;
  companyId: string;
  amount: Prisma.Decimal | number | string;
  /** Tahsilat yöntemi çek mi senet mi olduğunu söylüyor. */
  kind: ChequeKind;
  details?: ChequeDetailsInput;
  actorId: string;
}

/**
 * Tahsilatın kâğıt tarafını aç.
 *
 * `recordPayment` içinden, aynı veritabanı işleminde çağrılıyor: kâğıtsız bir
 * çek tahsilatı ya da tahsilatsız bir kâğıt, ikisi de defteri gerçekten
 * ayırırdı.
 */
export async function createChequeForCollection(
  tx: Tx,
  ctx: CreateChequeContext,
): Promise<{ id: string }> {
  const d = ctx.details ?? {};
  const cheque = await tx.cheque.create({
    data: {
      kind: d.kind ?? ctx.kind,
      status: "PORTFOLIO",
      company: { connect: { id: ctx.companyId } },
      transaction: { connect: { id: ctx.transactionId } },
      amount: round2(new Dec(ctx.amount)),
      serialNumber: d.serialNumber?.trim() || null,
      bankName: d.bankName?.trim() || null,
      branchName: d.branchName?.trim() || null,
      drawerName: d.drawerName?.trim() || null,
      dueDate: d.dueDate ?? null,
      notes: d.notes?.trim() || null,
    },
    select: { id: true },
  });

  await tx.chequeEvent.create({
    data: {
      cheque: { connect: { id: cheque.id } },
      toStatus: "PORTFOLIO",
      note: "Tahsilatla portföye girdi",
      ...(ctx.actorId ? { actor: { connect: { id: ctx.actorId } } } : {}),
    },
  });

  return cheque;
}

/**
 * Altındaki tahsilat iptal edilince kâğıdı düşür.
 *
 * Silmiyoruz: portföyden çıkan kâğıdın izi kalmalı. `CLEARED`/`ENDORSED` gibi
 * kendi defter etkisini üretmiş bir kâğıt buraya hiç gelmiyor — tahsilat iptali
 * o durumda zaten reddediliyor (bkz. `assertCollectionReversible`).
 */
export async function cancelChequeForReversal(
  tx: Tx,
  transactionId: string,
  actorId: string,
): Promise<void> {
  const cheque = await tx.cheque.findUnique({
    where: { transactionId },
    select: { id: true, status: true },
  });
  if (!cheque || cheque.status === "CANCELLED") return;

  await tx.cheque.update({
    where: { id: cheque.id },
    data: { status: "CANCELLED", settledAt: new Date() },
  });
  await tx.chequeEvent.create({
    data: {
      cheque: { connect: { id: cheque.id } },
      fromStatus: cheque.status,
      toStatus: "CANCELLED",
      note: "Tahsilat iptal edildi",
      ...(actorId ? { actor: { connect: { id: actorId } } } : {}),
    },
  });
}

/**
 * Bu tahsilat iptal edilebilir mi?
 *
 * Kâğıt hareket ettiyse hayır. Tahsil edilmiş bir çekin tahsilatını iptal
 * etmek, kasaya girmiş parayı defterde yok saymak demek; ciro edilmiş bir
 * çekinki, elimizde olmayan kâğıdı geri istemek. İkisi de önce kâğıt tarafında
 * düzeltilmeli.
 */
export async function assertCollectionReversible(
  tx: Tx,
  transactionId: string,
): Promise<void> {
  const cheque = await tx.cheque.findUnique({
    where: { transactionId },
    select: { status: true },
  });
  if (!cheque) return;
  if (cheque.status === "PORTFOLIO" || cheque.status === "DEPOSITED") return;
  if (cheque.status === "CANCELLED") return;

  throw new BusinessError(
    "CHEQUE_ALREADY_SETTLED",
    "Bu tahsilatın çeki/senedi işlem görmüş; önce portföy kaydını düzeltin",
  );
}

// ─────────────────────────────────────────────
// OKUMA
// ─────────────────────────────────────────────

export interface ChequeRecord {
  id: string;
  kind: ChequeKind;
  status: ChequeStatus;
  companyId: string;
  companyName: string;
  transactionId: string;
  amount: string;
  serialNumber: string | null;
  bankName: string | null;
  branchName: string | null;
  drawerName: string | null;
  dueDate: string | null;
  notes: string | null;
  endorsedTo: string | null;
  cashAccountName: string | null;
  settledAt: string | null;
  createdAt: string;
  /** Vadesi geçti ve hâlâ elimizde. Ekranda kırmızı olan satır. */
  isOverdue: boolean;
  /** Vadesi hiç girilmemiş — sahadan eksik gelen künye. */
  isIncomplete: boolean;
}

/** Kâğıt hâlâ bizde mi (vade takibi bunlara bakıyor). */
const OPEN_STATUSES: readonly ChequeStatus[] = ["PORTFOLIO", "DEPOSITED"];

function toRecord(r: {
  id: string;
  kind: ChequeKind;
  status: ChequeStatus;
  companyId: string;
  company: { name: string };
  transactionId: string;
  amount: Prisma.Decimal;
  serialNumber: string | null;
  bankName: string | null;
  branchName: string | null;
  drawerName: string | null;
  dueDate: Date | null;
  notes: string | null;
  endorsedTo: string | null;
  cashAccountId: string | null;
  settledAt: Date | null;
  createdAt: Date;
}, accountNames: Map<string, string>): ChequeRecord {
  const open = OPEN_STATUSES.includes(r.status);
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    companyId: r.companyId,
    companyName: r.company.name,
    transactionId: r.transactionId,
    amount: r.amount.toFixed(2),
    serialNumber: r.serialNumber,
    bankName: r.bankName,
    branchName: r.branchName,
    drawerName: r.drawerName,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    notes: r.notes,
    endorsedTo: r.endorsedTo,
    cashAccountName: r.cashAccountId
      ? accountNames.get(r.cashAccountId) ?? null
      : null,
    settledAt: r.settledAt ? r.settledAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    isOverdue: open && r.dueDate !== null && r.dueDate.getTime() < Date.now(),
    isIncomplete: open && r.dueDate === null,
  };
}

export async function listCheques(
  filter: ChequeFilterInput = {},
): Promise<ChequeRecord[]> {
  const where: Prisma.ChequeWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.kind ? { kind: filter.kind } : {}),
    ...(filter.companyId ? { companyId: filter.companyId } : {}),
    ...(filter.dueFrom || filter.dueTo
      ? {
          dueDate: {
            ...(filter.dueFrom ? { gte: filter.dueFrom } : {}),
            ...(filter.dueTo ? { lte: filter.dueTo } : {}),
          },
        }
      : {}),
    ...(filter.overdueOnly
      ? { status: { in: [...OPEN_STATUSES] }, dueDate: { lt: new Date() } }
      : {}),
  };

  const rows = await prisma.cheque.findMany({
    where,
    select: {
      id: true,
      kind: true,
      status: true,
      companyId: true,
      company: { select: { name: true } },
      transactionId: true,
      amount: true,
      serialNumber: true,
      bankName: true,
      branchName: true,
      drawerName: true,
      dueDate: true,
      notes: true,
      endorsedTo: true,
      cashAccountId: true,
      settledAt: true,
      createdAt: true,
    },
    // Vadesi olan önce ve en yakın vade üstte: bu ekranın tek sorusu "sırada ne
    // var". Vadesi girilmemiş kâğıtlar en sona düşüyor ve orada göze batıyorlar.
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: Math.min(filter.limit ?? 200, 500),
  });

  const accountIds = [
    ...new Set(rows.map((r) => r.cashAccountId).filter((v): v is string => !!v)),
  ];
  const accounts = accountIds.length
    ? await prisma.cashAccount.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(accounts.map((a) => [a.id, a.name]));

  return rows.map((r) => toRecord(r, names));
}

export interface ChequeSummary {
  /** Elimizdeki kâğıdın toplamı — portföy + tahsilde. */
  openTotal: string;
  openCount: number;
  overdueTotal: string;
  overdueCount: number;
  /** Önümüzdeki 30 gün içinde vadesi gelen. */
  dueSoonTotal: string;
  dueSoonCount: number;
  incompleteCount: number;
  byStatus: Array<{ status: ChequeStatus; count: number; total: string }>;
}

/**
 * Portföyün özeti.
 *
 * Toplamlar veritabanında alınıyor: portföy binlerce satıra çıkabiliyor ve
 * hepsini çekip JavaScript'te toplamak ekranı sayfa sayısıyla yavaşlatırdı.
 */
export async function getChequeSummary(): Promise<ChequeSummary> {
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [grouped, overdue, dueSoon, incomplete] = await Promise.all([
    prisma.cheque.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.cheque.aggregate({
      where: { status: { in: [...OPEN_STATUSES] }, dueDate: { lt: now } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.cheque.aggregate({
      where: {
        status: { in: [...OPEN_STATUSES] },
        dueDate: { gte: now, lte: soon },
      },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.cheque.count({
      where: { status: { in: [...OPEN_STATUSES] }, dueDate: null },
    }),
  ]);

  const byStatus = grouped.map((g) => ({
    status: g.status as ChequeStatus,
    count: g._count._all,
    total: new Dec(g._sum.amount ?? 0).toFixed(2),
  }));

  const open = byStatus.filter((s) => OPEN_STATUSES.includes(s.status));

  return {
    openTotal: open
      .reduce((acc, s) => acc.plus(new Dec(s.total)), new Dec(0))
      .toFixed(2),
    openCount: open.reduce((acc, s) => acc + s.count, 0),
    overdueTotal: new Dec(overdue._sum.amount ?? 0).toFixed(2),
    overdueCount: overdue._count._all,
    dueSoonTotal: new Dec(dueSoon._sum.amount ?? 0).toFixed(2),
    dueSoonCount: dueSoon._count._all,
    incompleteCount: incomplete,
    byStatus,
  };
}

export interface ChequeEventRecord {
  id: string;
  fromStatus: ChequeStatus | null;
  toStatus: ChequeStatus;
  note: string | null;
  actorName: string | null;
  occurredAt: string;
}

export async function getCheque(id: string): Promise<
  (ChequeRecord & { events: ChequeEventRecord[] }) | null
> {
  const row = await prisma.cheque.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      status: true,
      companyId: true,
      company: { select: { name: true } },
      transactionId: true,
      amount: true,
      serialNumber: true,
      bankName: true,
      branchName: true,
      drawerName: true,
      dueDate: true,
      notes: true,
      endorsedTo: true,
      cashAccountId: true,
      settledAt: true,
      createdAt: true,
      events: {
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          actor: { select: { name: true } },
          occurredAt: true,
        },
        orderBy: { occurredAt: "asc" },
      },
    },
  });
  if (!row) return null;

  const account = row.cashAccountId
    ? await prisma.cashAccount.findUnique({
        where: { id: row.cashAccountId },
        select: { name: true },
      })
    : null;

  return {
    ...toRecord(
      row,
      new Map(account && row.cashAccountId ? [[row.cashAccountId, account.name]] : []),
    ),
    events: row.events.map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus as ChequeStatus | null,
      toStatus: e.toStatus as ChequeStatus,
      note: e.note,
      actorName: e.actor?.name ?? null,
      occurredAt: e.occurredAt.toISOString(),
    })),
  };
}

// ─────────────────────────────────────────────
// KÜNYE DÜZELTME
// ─────────────────────────────────────────────

/**
 * Sahadan eksik gelen bilgiyi ofiste tamamla.
 *
 * Tutar burada yok: tutarı değiştirmek cariyi de değiştirmek demek ve o iş
 * tahsilat iptali + yeniden giriş ile yapılır. Kâğıdın künyesi ile paranın
 * kendisi ayrı sorular.
 */
export async function updateChequeDetails(
  id: string,
  input: ChequeDetailsInput,
  actorId: string,
): Promise<{ id: string }> {
  const cheque = await prisma.cheque.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!cheque) throw new BusinessError("CHEQUE_NOT_FOUND", "Kâğıt bulunamadı");
  if (CHEQUE_TERMINAL_STATUSES.includes(cheque.status as ChequeStatus)) {
    throw new BusinessError(
      "INVALID_STATE",
      "Kapanmış kâğıdın künyesi değiştirilemez",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.cheque.update({
      where: { id },
      data: {
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.serialNumber !== undefined
          ? { serialNumber: input.serialNumber.trim() || null }
          : {}),
        ...(input.bankName !== undefined
          ? { bankName: input.bankName.trim() || null }
          : {}),
        ...(input.branchName !== undefined
          ? { branchName: input.branchName.trim() || null }
          : {}),
        ...(input.drawerName !== undefined
          ? { drawerName: input.drawerName.trim() || null }
          : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
      },
    });
    await tx.chequeEvent.create({
      data: {
        cheque: { connect: { id } },
        fromStatus: cheque.status,
        toStatus: cheque.status,
        note: "Künye güncellendi",
        ...(actorId ? { actor: { connect: { id: actorId } } } : {}),
      },
    });
  });

  return { id };
}

// ─────────────────────────────────────────────
// DURUM DEĞİŞİKLİĞİ
// ─────────────────────────────────────────────

export interface ChequeActionResult {
  id: string;
  status: ChequeStatus;
  /** Tahsil edildiğinde yazılan kasa hareketi. */
  cashMovementId: string | null;
  /** Karşılıksız/iade durumunda borcu geri açan kayıt. */
  reopenTransactionId: string | null;
}

/**
 * Kâğıdı bir sonraki duruma geçir.
 *
 * Defter etkileri burada, tek yerde:
 *   CLEARED  → kasaya giriş (para gerçekten şimdi geldi)
 *   BOUNCED  → cariye borç (kapanan alacak geri açılıyor)
 *   RETURNED → cariye borç (kâğıdı geri verdik, alacak da geri geldi)
 *   ENDORSED → hiçbiri (kâğıt bize ödeme yapmadı, başkasına ödeme oldu)
 *
 * Geçişin kendisi tipteki tabloya bakıyor; buradaki `if` zinciri yalnızca
 * paranın nereye gittiğini anlatıyor. İkisi ayrı kalmalı: hangi geçişin serbest
 * olduğu ile o geçişte ne yazıldığı farklı sorular.
 */
export async function advanceCheque(
  id: string,
  input: ChequeActionInput,
  actorId: string,
): Promise<ChequeActionResult> {
  return prisma.$transaction(async (tx) => {
    const cheque = await tx.cheque.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        amount: true,
        companyId: true,
        company: { select: { name: true } },
        kind: true,
        serialNumber: true,
      },
    });
    if (!cheque) throw new BusinessError("CHEQUE_NOT_FOUND", "Kâğıt bulunamadı");

    const from = cheque.status as ChequeStatus;
    if (!canTransition(from, input.status)) {
      throw new BusinessError(
        "INVALID_CHEQUE_TRANSITION",
        `Bu kâğıt "${from}" durumundan "${input.status}" durumuna geçemez`,
      );
    }

    const amount = new Dec(cheque.amount);
    const label = `${cheque.kind === "CHEQUE" ? "Çek" : "Senet"}${
      cheque.serialNumber ? ` ${cheque.serialNumber}` : ""
    }`;

    let cashMovementId: string | null = null;
    let reopenTransactionId: string | null = null;

    if (input.status === "CLEARED") {
      // Para bugün geldi: kasa hareketinin tarihi bugünün gün sonuna ait.
      const accountId =
        input.cashAccountId ??
        (
          await tx.cashAccount.findFirst({
            where: { isDefault: true, isActive: true },
            select: { id: true },
          })
        )?.id;
      if (!accountId) {
        throw new BusinessError(
          "CASH_ACCOUNT_NOT_FOUND",
          "Paranın gireceği hesabı seçin",
        );
      }
      const movement = await postCashMovement(tx, {
        accountId,
        direction: "IN",
        amount,
        source: "CHEQUE",
        description: `${label} tahsil — ${cheque.company.name}`,
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        recordedById: actorId,
      });
      cashMovementId = movement.id;
    }

    if (input.status === "BOUNCED" || input.status === "RETURNED") {
      // Tahsilat kaydı silinmiyor — o tahsilat gerçekten yapılmıştı. Kapanan
      // borç yeni bir borç satırıyla geri açılıyor; ekstrede ikisi de görünür,
      // müşterinin muhasebecisi neyin ne olduğunu okuyabilir.
      const reason =
        input.status === "BOUNCED" ? "karşılıksız" : "müşteriye iade edildi";
      const reopen = await tx.transaction.create({
        data: {
          company: { connect: { id: cheque.companyId } },
          type: "DEBIT",
          amount,
          description: `${label} ${reason}`,
          recordedBy: { connect: { id: actorId } },
        },
        select: { id: true },
      });
      await tx.company.update({
        where: { id: cheque.companyId },
        data: { currentBalance: { increment: amount } },
      });
      reopenTransactionId = reopen.id;
    }

    await tx.cheque.update({
      where: { id },
      data: {
        status: input.status,
        ...(cashMovementId
          ? { cashMovementId, cashAccountId: input.cashAccountId ?? undefined }
          : {}),
        ...(reopenTransactionId ? { reopenTransactionId } : {}),
        ...(input.status === "ENDORSED"
          ? { endorsedTo: input.endorsedTo?.trim() || null }
          : {}),
        ...(CHEQUE_TERMINAL_STATUSES.includes(input.status)
          ? { settledAt: input.occurredAt ?? new Date() }
          : { settledAt: null }),
      },
    });

    await tx.chequeEvent.create({
      data: {
        cheque: { connect: { id } },
        fromStatus: from,
        toStatus: input.status,
        note: input.note?.trim() || null,
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        ...(actorId ? { actor: { connect: { id: actorId } } } : {}),
      },
    });

    return { id, status: input.status, cashMovementId, reopenTransactionId };
  });
}
