import { prisma } from "@repo/database";
import type { PaymentMethod } from "@repo/types";
import { BusinessError } from "./errors";
import { Dec, round2 } from "./money";

// Field collection: a sales rep (or admin) records a payment against a company's
// cari (open account). Writes a CREDIT ledger entry and decrements the cached
// currentBalance in a single transaction so the two never diverge.
// Company authorization is enforced at the route layer.

export interface RecordPaymentInput {
  companyId: string;
  amount: number;
  paymentMethod: PaymentMethod;
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
        paymentMethod: input.paymentMethod,
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
