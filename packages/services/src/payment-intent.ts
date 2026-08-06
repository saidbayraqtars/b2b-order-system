import { Prisma, prisma } from "@repo/database";
import type { PaymentIntentStatus } from "@repo/types";
import { postCashMovement, resolveAccountForMethod } from "./cash";
import { BusinessError } from "./errors";
import { Dec, round2, type Money } from "./money";
import {
  requirePaymentProvider,
  type AuthorizeResult,
  type PaymentProvider,
} from "./payment-provider-registry";
import { paymentSettings } from "./tenant";

type Tx = Prisma.TransactionClient;

// Kart tahsilatının hayatı.
//
// Before this file existed, a CREDIT_CARD order booked its money into the till
// at confirmation — money nobody had charged. The intent is the missing step
// between "the customer said they would pay by card" and "the money is ours",
// and the till entry now hangs off the second one.
//
// Everything a provider is allowed to do is declared in
// payment-provider-registry.ts. This module only sequences it and keeps the
// ledger honest about the result.

// ─────────────────────────────────────────────
// OPENING ONE
// ─────────────────────────────────────────────

export interface OpenIntentInput {
  orderId: string;
  companyId: string;
  amount: Money;
  currency?: string;
  installmentCount?: number;
  actorId: string;
}

export interface OpenIntentResult {
  intentId: string;
  status: PaymentIntentStatus;
  /** Set when the customer has to be sent somewhere to finish paying. */
  redirectUrl: string | null;
}

/**
 * Open the card charge for an order.
 *
 * Runs inside the order's own transaction: an intent that survived a rolled
 * back order would be a charge against a sale that does not exist. The provider
 * call itself is *not* in that transaction — see `authorizeOpenIntent`, which
 * runs after the order is committed, because holding a database transaction
 * open across a network call to a bank is how connection pools die.
 */
export async function openIntentForOrder(
  tx: Tx,
  input: OpenIntentInput,
): Promise<{ intentId: string }> {
  const settings = await paymentSettings();
  // Refuses an unknown key rather than silently booking nothing: a typo in
  // tenant.json must not turn into orders whose money is never asked for.
  const provider = requirePaymentProvider(settings.provider);

  const installments = input.installmentCount ?? 1;
  if (installments > 1 && !provider.capabilities.installments.includes(installments)) {
    throw new BusinessError(
      "PAYMENT_INSTALLMENT_NOT_ALLOWED",
      `${provider.label} ${installments} taksiti desteklemiyor`,
      { installments, supported: provider.capabilities.installments },
    );
  }

  const intent = await tx.paymentIntent.create({
    data: {
      provider: provider.key,
      status: "PENDING",
      amount: round2(new Dec(input.amount)),
      currency: input.currency ?? "TRY",
      installmentCount: installments,
      order: { connect: { id: input.orderId } },
      company: { connect: { id: input.companyId } },
      createdBy: { connect: { id: input.actorId } },
      events: {
        create: {
          status: "PENDING",
          note: `Kart tahsilatı açıldı — ${provider.label}`,
          actorId: input.actorId,
        },
      },
    },
    select: { id: true },
  });

  return { intentId: intent.id };
}

/**
 * Call the provider for an intent that has just been opened.
 *
 * Separate from `openIntentForOrder` and called after its transaction commits.
 * A provider is a network hop to someone else's server; keeping a database
 * transaction — and the row locks under it — open for its duration would let
 * one slow bank stall every other order in the system.
 */
export async function authorizeOpenIntent(
  intentId: string,
  returnUrl: string,
): Promise<OpenIntentResult> {
  const intent = await prisma.paymentIntent.findUnique({
    where: { id: intentId },
    select: {
      id: true,
      provider: true,
      status: true,
      amount: true,
      currency: true,
      installmentCount: true,
      company: { select: { name: true } },
      order: { select: { orderNumber: true } },
    },
  });
  if (!intent) {
    throw new BusinessError("PAYMENT_INTENT_NOT_FOUND", "Ödeme kaydı bulunamadı");
  }
  if (intent.status !== "PENDING") {
    return { intentId, status: intent.status, redirectUrl: null };
  }

  const provider = requirePaymentProvider(intent.provider);
  const settings = await paymentSettings();

  let result: AuthorizeResult;
  try {
    result = await provider.authorize({
      intentId: intent.id,
      amount: intent.amount,
      currency: intent.currency,
      installmentCount: intent.installmentCount,
      orderNumber: intent.order?.orderNumber ?? null,
      companyName: intent.company.name,
      returnUrl,
    });
  } catch (e) {
    // A provider that threw is a payment that did not happen. Recording that is
    // the whole point of the row — an exception swallowed here would leave an
    // intent sitting at PENDING forever with no reason attached.
    await recordFailure(intent.id, e instanceof Error ? e.message : String(e));
    throw e;
  }

  if (result.status === "CAPTURED") {
    await settleCapture(intent.id, {
      providerRef: result.providerRef ?? null,
      payload: result.payload,
      note: `${provider.label} tahsil etti`,
      actorId: null,
    });
    return { intentId, status: "CAPTURED", redirectUrl: null };
  }

  if (result.status === "FAILED") {
    await recordFailure(intent.id, result.failureReason ?? "Sağlayıcı reddetti", result.payload);
    return { intentId, status: "FAILED", redirectUrl: null };
  }

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: {
      status: result.status,
      providerRef: result.providerRef ?? null,
      redirectUrl: result.redirectUrl ?? null,
      events: {
        create: {
          status: result.status,
          note: describeAuthorize(provider, result, settings.autoCapture),
          payload: asJson(result.payload),
        },
      },
    },
  });

  // Money that is only held becomes money we have, when the installation asked
  // for that. Never reachable for the manual provider, which returns PENDING —
  // there a human is the capture step, by design.
  if (result.status === "AUTHORIZED" && settings.autoCapture && provider.capture) {
    const captured = await capturePaymentIntent(intent.id, null);
    return { intentId, status: captured.status, redirectUrl: null };
  }

  return {
    intentId,
    status: result.status,
    redirectUrl: result.redirectUrl ?? null,
  };
}

function describeAuthorize(
  provider: PaymentProvider,
  result: AuthorizeResult,
  autoCapture: boolean,
): string {
  if (result.redirectUrl) return "3-D Secure için bankaya yönlendirildi";
  if (result.status === "AUTHORIZED") {
    return autoCapture
      ? `${provider.label} provizyon aldı — tahsilat bekleniyor`
      : `${provider.label} provizyon aldı`;
  }
  return provider.capabilities.manual
    ? "Manuel onay bekleniyor"
    : `${provider.label} yanıtı bekleniyor`;
}

// ─────────────────────────────────────────────
// CAPTURE — the only door money comes through
// ─────────────────────────────────────────────

export interface CaptureResultView {
  intentId: string;
  status: PaymentIntentStatus;
  cashMovementId: string | null;
  balance: string | null;
}

/**
 * Take the money and write it into the till.
 *
 * This is the single place a card payment becomes cash in the ledger. It is
 * idempotent by construction: `PaymentIntent.cashMovementId` is unique, and an
 * intent already sitting at CAPTURED is refused before anything is written, so
 * a double-clicked onayla button cannot book the amount twice.
 */
export async function capturePaymentIntent(
  intentId: string,
  /** Null when the system captured it on its own (autoCapture), not a person. */
  actorId: string | null,
): Promise<CaptureResultView> {
  const intent = await prisma.paymentIntent.findUnique({
    where: { id: intentId },
    select: {
      id: true,
      provider: true,
      status: true,
      amount: true,
      providerRef: true,
      orderId: true,
      order: { select: { orderNumber: true, status: true } },
    },
  });
  if (!intent) {
    throw new BusinessError("PAYMENT_INTENT_NOT_FOUND", "Ödeme kaydı bulunamadı");
  }
  if (intent.status === "CAPTURED") {
    throw new BusinessError("INVALID_STATE", "Bu tahsilat zaten alınmış");
  }
  if (intent.status !== "PENDING" && intent.status !== "AUTHORIZED") {
    throw new BusinessError(
      "INVALID_STATE",
      "Yalnızca bekleyen ya da provizyonlu bir tahsilat alınabilir",
    );
  }
  // Charging the card for an order that has been cancelled would take money for
  // goods nobody is going to ship.
  if (intent.order && (intent.order.status === "CANCELLED" || intent.order.status === "REJECTED")) {
    throw new BusinessError(
      "INVALID_STATE",
      "İptal edilmiş siparişin tahsilatı alınamaz",
    );
  }

  const provider = requirePaymentProvider(intent.provider);

  if (provider.capture) {
    const result = await provider.capture({
      intentId: intent.id,
      providerRef: intent.providerRef,
      amount: intent.amount,
    });
    if (result.status === "FAILED") {
      await recordFailure(
        intent.id,
        result.failureReason ?? "Tahsilat reddedildi",
        result.payload,
      );
      return { intentId, status: "FAILED", cashMovementId: null, balance: null };
    }
    return settleCapture(intent.id, {
      providerRef: result.providerRef ?? intent.providerRef,
      payload: result.payload,
      note: provider.capabilities.manual
        ? "Operatör onayladı — POS'tan çekildi"
        : `${provider.label} tahsil etti`,
      actorId,
    });
  }

  // A provider with no capture() charged during authorize; reaching here means
  // its authorize said PENDING and never came back, which is not a state a
  // human may resolve by declaring the money received.
  throw new BusinessError(
    "INVALID_STATE",
    `${provider.label} elle tahsilat onayını desteklemiyor`,
  );
}

/**
 * Write the captured money into the till, in one transaction with the status.
 *
 * The account is chosen by the same `CREDIT_CARD` binding a peşin order would
 * use, so a card sale lands wherever the operator said card money lands —
 * usually the POS account, which is money earned but not yet settled by the
 * provider.
 */
async function settleCapture(
  intentId: string,
  ctx: {
    providerRef: string | null;
    payload?: Record<string, unknown>;
    note: string;
    actorId: string | null;
  },
): Promise<CaptureResultView> {
  return prisma.$transaction(async (tx) => {
    const intent = await tx.paymentIntent.findUniqueOrThrow({
      where: { id: intentId },
      select: {
        id: true,
        amount: true,
        status: true,
        orderId: true,
        cashMovementId: true,
        order: { select: { orderNumber: true } },
      },
    });
    // Re-read inside the transaction: two operators pressing onayla at the same
    // moment both passed the check outside it.
    if (intent.status === "CAPTURED" || intent.cashMovementId) {
      throw new BusinessError("INVALID_STATE", "Bu tahsilat zaten alınmış");
    }

    const accountId = await resolveAccountForMethod(tx, "CREDIT_CARD");
    const movement = await postCashMovement(tx, {
      accountId,
      direction: "IN",
      amount: intent.amount,
      source: "ORDER",
      description: intent.order
        ? `Kart tahsilatı — Sipariş ${intent.order.orderNumber}`
        : "Kart tahsilatı",
      orderId: intent.orderId,
      recordedById: ctx.actorId,
    });

    await tx.paymentIntent.update({
      where: { id: intentId },
      data: {
        status: "CAPTURED",
        capturedAt: new Date(),
        providerRef: ctx.providerRef,
        redirectUrl: null,
        failureReason: null,
        cashMovement: { connect: { id: movement.id } },
        events: {
          create: {
            status: "CAPTURED",
            note: ctx.note,
            payload: asJson(ctx.payload),
            actorId: ctx.actorId,
          },
        },
      },
    });

    return {
      intentId,
      status: "CAPTURED" as const,
      cashMovementId: movement.id,
      balance: movement.balance,
    };
  });
}

// ─────────────────────────────────────────────
// GIVING UP AND GIVING BACK
// ─────────────────────────────────────────────

async function recordFailure(
  intentId: string,
  reason: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  await prisma.paymentIntent.update({
    where: { id: intentId },
    data: {
      status: "FAILED",
      failureReason: reason.slice(0, 500),
      redirectUrl: null,
      events: {
        create: { status: "FAILED", note: reason.slice(0, 300), payload: asJson(payload) },
      },
    },
  });
}

/** Abandon a charge that was never taken. Nothing to reverse — no money moved. */
export async function cancelPaymentIntent(
  intentId: string,
  reason: string,
  actorId: string | null,
): Promise<void> {
  const intent = await prisma.paymentIntent.findUnique({
    where: { id: intentId },
    select: { status: true },
  });
  if (!intent) {
    throw new BusinessError("PAYMENT_INTENT_NOT_FOUND", "Ödeme kaydı bulunamadı");
  }
  if (intent.status === "CAPTURED") {
    throw new BusinessError(
      "INVALID_STATE",
      "Tahsil edilmiş ödeme iptal edilemez — iade edin",
    );
  }
  if (intent.status === "CANCELLED" || intent.status === "REFUNDED") return;

  await prisma.paymentIntent.update({
    where: { id: intentId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      redirectUrl: null,
      events: { create: { status: "CANCELLED", note: reason.slice(0, 300), actorId } },
    },
  });
}

/**
 * Cancel whatever is still open on an order, and reverse what was taken.
 *
 * Called from the order cancellation path. Split by state rather than by
 * assumption: an untaken charge is simply abandoned, while a captured one has
 * to give money back — and the till entry for that is reversed by
 * `reverseOrderCash`, which the same cancellation already calls.
 */
export async function releaseIntentsForOrder(
  tx: Tx,
  orderId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  const open = await tx.paymentIntent.findMany({
    where: { orderId, status: { in: ["PENDING", "AUTHORIZED"] } },
    select: { id: true },
  });

  for (const intent of open) {
    await tx.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        redirectUrl: null,
        events: { create: { status: "CANCELLED", note: reason.slice(0, 300), actorId } },
      },
    });
  }

  // A captured intent stays CAPTURED here and becomes REFUNDED: the customer's
  // money did move, and pretending it did not would lose the fact that it has
  // to go back.
  const captured = await tx.paymentIntent.findMany({
    where: { orderId, status: "CAPTURED" },
    select: { id: true },
  });
  for (const intent of captured) {
    await tx.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: "REFUNDED",
        events: {
          create: {
            status: "REFUNDED",
            note: `${reason} — kasa kaydı ters kayıtla geri alındı`,
            actorId,
          },
        },
      },
    });
  }
}

// ─────────────────────────────────────────────
// READING BACK
// ─────────────────────────────────────────────

export interface PaymentIntentRow {
  id: string;
  provider: string;
  status: PaymentIntentStatus;
  amount: string;
  currency: string;
  installmentCount: number;
  orderId: string | null;
  orderNumber: string | null;
  companyId: string;
  companyName: string;
  providerRef: string | null;
  failureReason: string | null;
  createdAt: string;
  capturedAt: string | null;
  /** True when an operator may confirm it by hand — a manual provider only. */
  awaitingManualConfirmation: boolean;
}

export interface IntentFilter {
  status?: PaymentIntentStatus;
  companyId?: string;
  orderId?: string;
  limit?: number;
}

const ROW_SELECT = {
  id: true,
  provider: true,
  status: true,
  amount: true,
  currency: true,
  installmentCount: true,
  orderId: true,
  order: { select: { orderNumber: true } },
  companyId: true,
  company: { select: { name: true } },
  providerRef: true,
  failureReason: true,
  createdAt: true,
  capturedAt: true,
} satisfies Prisma.PaymentIntentSelect;

type IntentRow = Prisma.PaymentIntentGetPayload<{ select: typeof ROW_SELECT }>;

function toRow(r: IntentRow): PaymentIntentRow {
  return {
    id: r.id,
    provider: r.provider,
    status: r.status,
    amount: r.amount.toFixed(2),
    currency: r.currency,
    installmentCount: r.installmentCount,
    orderId: r.orderId,
    orderNumber: r.order?.orderNumber ?? null,
    companyId: r.companyId,
    companyName: r.company.name,
    providerRef: r.providerRef,
    failureReason: r.failureReason,
    createdAt: r.createdAt.toISOString(),
    capturedAt: r.capturedAt?.toISOString() ?? null,
    awaitingManualConfirmation:
      (r.status === "PENDING" || r.status === "AUTHORIZED") &&
      isManualProvider(r.provider),
  };
}

export async function listPaymentIntents(
  filter: IntentFilter = {},
): Promise<PaymentIntentRow[]> {
  const rows = await prisma.paymentIntent.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.companyId ? { companyId: filter.companyId } : {}),
      ...(filter.orderId ? { orderId: filter.orderId } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(filter.limit ?? 100, 500),
    select: ROW_SELECT,
  });

  return rows.map(toRow);
}

function isManualProvider(key: string): boolean {
  // Unknown providers are not offered a manual button: a key nobody recognises
  // must not become a way to declare money received.
  const provider = requirePaymentProviderSafe(key);
  return provider?.capabilities.manual ?? false;
}

function requirePaymentProviderSafe(key: string): PaymentProvider | null {
  try {
    return requirePaymentProvider(key);
  } catch {
    return null;
  }
}

export interface PaymentIntentDetail extends PaymentIntentRow {
  events: Array<{
    id: string;
    status: PaymentIntentStatus;
    note: string | null;
    actorName: string | null;
    createdAt: string;
  }>;
}

export async function getPaymentIntent(id: string): Promise<PaymentIntentDetail> {
  const row = await prisma.paymentIntent.findUnique({
    where: { id },
    select: ROW_SELECT,
  });
  if (!row) {
    throw new BusinessError("PAYMENT_INTENT_NOT_FOUND", "Ödeme kaydı bulunamadı");
  }

  const events = await prisma.paymentIntentEvent.findMany({
    where: { intentId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      note: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
  });

  return {
    ...toRow(row),
    events: events.map((e) => ({
      id: e.id,
      status: e.status,
      note: e.note,
      actorName: e.actor?.name ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

/** Prisma's Json column rejects `undefined`; null is the empty payload. */
function asJson(payload?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
  return payload ? (payload as Prisma.InputJsonValue) : undefined;
}
