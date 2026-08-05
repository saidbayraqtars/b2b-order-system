import { prisma } from "@repo/database";
import type { CollectionMethod } from "@repo/types";
import { BusinessError } from "./errors";
import { Dec, round2 } from "./money";

// Field collection: a sales rep (or admin) records a payment against a company's
// cari (open account). Writes a CREDIT ledger entry and decrements the cached
// currentBalance in a single transaction so the two never diverge.
// Company authorization is enforced at the route layer.

export interface RecordPaymentInput {
  companyId: string;
  amount: number;
  collectionMethod: CollectionMethod;
  description?: string;
}

export interface RecordPaymentResult {
  transactionId: string;
  amount: string;
  newBalance: string;
}

export async function recordPayment(
  input: RecordPaymentInput,
  recordedById: string,
): Promise<RecordPaymentResult> {
  const amount = round2(new Dec(input.amount));

  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: { id: input.companyId },
      select: { id: true },
    });
    if (!company) {
      throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı");
    }

    const txn = await tx.transaction.create({
      data: {
        company: { connect: { id: input.companyId } },
        type: "CREDIT",
        amount,
        collectionMethod: input.collectionMethod,
        description: input.description ?? "Tahsilat",
        recordedBy: { connect: { id: recordedById } },
      },
      select: { id: true },
    });

    const updated = await tx.company.update({
      where: { id: input.companyId },
      data: { currentBalance: { decrement: amount } },
      select: { currentBalance: true },
    });

    return {
      transactionId: txn.id,
      amount: amount.toFixed(2),
      newBalance: updated.currentBalance.toFixed(2),
    };
  });
}

// ─────────────────────────────────────────────
// READING BACK
// ─────────────────────────────────────────────

export interface PaymentRecord {
  id: string;
  companyId: string;
  companyName: string;
  amount: string;
  collectionMethod: CollectionMethod | null;
  description: string | null;
  createdAt: string;
  recordedByName: string | null;
  /** Id of the correcting entry, when this collection has been undone. */
  reversedById: string | null;
}

/**
 * Whose collections to list.
 *
 * `company` is everything credited to one (already authorized) customer,
 * whoever recorded it — the rep needs to see the office's entries too, or they
 * will collect a debt that was already paid. `recorder` is the caller's own
 * entries across their portfolio, which is the "what did I collect today"
 * question. There is no unscoped variant on purpose.
 */
export type PaymentScope =
  | { kind: "company"; companyId: string }
  | { kind: "recorder"; recordedById: string };

export async function listPayments(
  scope: PaymentScope,
  limit = 50,
): Promise<PaymentRecord[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      type: "CREDIT",
      ...(scope.kind === "company"
        ? { companyId: scope.companyId }
        : { recordedById: scope.recordedById }),
    },
    select: {
      id: true,
      companyId: true,
      company: { select: { name: true } },
      amount: true,
      collectionMethod: true,
      description: true,
      createdAt: true,
      recordedBy: { select: { name: true } },
      reversedBy: { select: { id: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(limit, 200),
  });

  return rows.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    companyName: r.company.name,
    amount: r.amount.toFixed(2),
    collectionMethod: r.collectionMethod,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
    recordedByName: r.recordedBy?.name ?? null,
    reversedById: r.reversedBy?.id ?? null,
  }));
}

// ─────────────────────────────────────────────
// REVERSAL
// ─────────────────────────────────────────────

export interface ReversePaymentResult {
  reversalId: string;
  amount: string;
  newBalance: string;
}

/**
 * Undo a collection by writing its opposite, never by deleting it.
 *
 * A wrong tahsilat (extra zero, wrong customer) previously needed database
 * access to fix. It is corrected here the way an accountant corrects a ledger:
 * an equal DEBIT that points at the original, so the ekstre shows both the
 * mistake and its correction instead of quietly losing a row the customer may
 * already have seen.
 *
 * `companyId` is the company the caller was authorized for. Passing it in and
 * comparing here means a rep cannot reverse an entry belonging to a company
 * outside their portfolio by guessing a transaction id.
 */
export async function reversePayment(
  params: { transactionId: string; companyId: string; reason: string },
  reversedById: string,
): Promise<ReversePaymentResult> {
  return prisma.$transaction(async (tx) => {
    const original = await tx.transaction.findUnique({
      where: { id: params.transactionId },
      select: {
        id: true,
        companyId: true,
        type: true,
        amount: true,
        reversedBy: { select: { id: true } },
        reversalOfId: true,
      },
    });

    if (!original || original.companyId !== params.companyId) {
      // Same answer for "does not exist" and "belongs to someone else": the
      // second must not be distinguishable by probing ids.
      throw new BusinessError("TRANSACTION_NOT_FOUND", "Tahsilat bulunamadı");
    }
    if (original.type !== "CREDIT") {
      throw new BusinessError(
        "INVALID_STATE",
        "Yalnızca tahsilat kaydı iptal edilebilir",
      );
    }
    if (original.reversalOfId) {
      throw new BusinessError(
        "INVALID_STATE",
        "Bu kayıt zaten bir iptal kaydı",
      );
    }
    if (original.reversedBy) {
      throw new BusinessError("INVALID_STATE", "Bu tahsilat zaten iptal edilmiş");
    }

    const amount = new Dec(original.amount);

    const reversal = await tx.transaction.create({
      data: {
        company: { connect: { id: original.companyId } },
        type: "DEBIT",
        amount,
        description: `Tahsilat iptali: ${params.reason}`,
        reversalOf: { connect: { id: original.id } },
        recordedBy: { connect: { id: reversedById } },
      },
      select: { id: true },
    });

    const updated = await tx.company.update({
      where: { id: original.companyId },
      data: { currentBalance: { increment: amount } },
      select: { currentBalance: true },
    });

    return {
      reversalId: reversal.id,
      amount: amount.toFixed(2),
      newBalance: updated.currentBalance.toFixed(2),
    };
  });
}
