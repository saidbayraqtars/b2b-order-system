import { Prisma, prisma } from "@repo/database";
import {
  type CashAccountKind,
  type CashDirection,
  type CashMovementSource,
  type PaymentMethod,
} from "@repo/types";
import { BusinessError } from "./errors";
import { Dec, round2, type Money } from "./money";
import { entersCashAccount, settlesToCashAccount } from "./payment-terms";

type Tx = Prisma.TransactionClient;

// Kasa & banka defteri.
//
// The cari ledger (Transaction) answers "what does this customer owe". Nothing
// answered "how much money do we hold, and where" — a nakit or havale order
// booked no debt and therefore left no trace at all. This module is that second
// ledger.
//
// Two rules it keeps, both borrowed from the cari side because they have earned
// it there:
//
//  * Append-only. A wrong entry is corrected by its opposite pointing back at
//    it, never by an UPDATE or a DELETE, so the gün sonu of a day that has been
//    closed cannot silently change afterwards.
//  * The cached balance and the entries are written in the same database
//    transaction. `CashAccount.currentBalance` is a convenience, and the moment
//    it is written anywhere else it becomes a lie.

// ─────────────────────────────────────────────
// WHICH ACCOUNT
// ─────────────────────────────────────────────

/**
 * The account a payment method settles into: its binding, or the default till.
 *
 * The fallback matters. An order arriving at midnight from a customer's own
 * browser cannot stop and ask, and refusing the order because an admin never
 * opened the kasa screen would trade a bookkeeping gap for a lost sale. So the
 * money always lands somewhere, and the somewhere is visible: an operator who
 * finds card sales in Merkez Kasa knows exactly which binding to set.
 */
export async function resolveAccountForMethod(
  tx: Tx,
  method: PaymentMethod,
): Promise<string> {
  const binding = await tx.paymentMethodAccount.findUnique({
    where: { method },
    select: { account: { select: { id: true, isActive: true } } },
  });
  if (binding?.account.isActive) return binding.account.id;

  return defaultAccountId(tx);
}

async function defaultAccountId(tx: Tx): Promise<string> {
  const preferred = await tx.cashAccount.findFirst({
    where: { isDefault: true, isActive: true },
    select: { id: true },
  });
  if (preferred) return preferred.id;

  // The default was deactivated behind the guard's back (direct SQL, a restored
  // dump). Any open account beats dropping the entry on the floor.
  const fallback = await tx.cashAccount.findFirst({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (!fallback) {
    throw new BusinessError(
      "CASH_ACCOUNT_NOT_FOUND",
      "Tanımlı bir kasa/banka hesabı yok — önce hesap açın",
    );
  }
  return fallback.id;
}

// ─────────────────────────────────────────────
// POSTING
// ─────────────────────────────────────────────

export interface PostMovementInput {
  accountId: string;
  direction: CashDirection;
  amount: Money | number | string;
  source: CashMovementSource;
  description?: string | null;
  occurredAt?: Date;
  orderId?: string | null;
  transactionId?: string | null;
  reversalOfId?: string | null;
  recordedById?: string | null;
}

export interface PostedMovement {
  id: string;
  accountId: string;
  amount: string;
  direction: CashDirection;
  /** The account's balance after this entry. */
  balance: string;
}

/**
 * Write one entry and move the account's balance with it.
 *
 * Takes a transaction client rather than opening its own: order confirmation
 * and collection recording already run inside one, and a till entry that
 * survives a rolled-back order would be worse than no entry at all.
 */
export async function postCashMovement(
  tx: Tx,
  input: PostMovementInput,
): Promise<PostedMovement> {
  const amount = round2(new Dec(input.amount));
  if (amount.lessThanOrEqualTo(0)) {
    throw new BusinessError("INVALID_AMOUNT", "Tutar sıfırdan büyük olmalıdır");
  }

  const account = await tx.cashAccount.findUnique({
    where: { id: input.accountId },
    select: { id: true, isActive: true },
  });
  if (!account) {
    throw new BusinessError("CASH_ACCOUNT_NOT_FOUND", "Kasa/banka hesabı bulunamadı");
  }
  // A closed account still accepts corrections — that is half the reason it was
  // closed — but nothing new may be booked into it.
  if (!account.isActive && input.source !== "MANUAL" && !input.reversalOfId) {
    throw new BusinessError(
      "CASH_ACCOUNT_INACTIVE",
      "Kapalı hesaba yeni hareket yazılamaz",
    );
  }

  const movement = await tx.cashMovement.create({
    data: {
      account: { connect: { id: input.accountId } },
      direction: input.direction,
      amount,
      source: input.source,
      description: input.description ?? null,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      ...(input.orderId ? { order: { connect: { id: input.orderId } } } : {}),
      ...(input.transactionId
        ? { transaction: { connect: { id: input.transactionId } } }
        : {}),
      ...(input.reversalOfId
        ? { reversalOf: { connect: { id: input.reversalOfId } } }
        : {}),
      ...(input.recordedById
        ? { recordedBy: { connect: { id: input.recordedById } } }
        : {}),
    },
    select: { id: true },
  });

  const updated = await tx.cashAccount.update({
    where: { id: input.accountId },
    data: {
      currentBalance:
        input.direction === "IN" ? { increment: amount } : { decrement: amount },
    },
    select: { currentBalance: true },
  });

  return {
    id: movement.id,
    accountId: input.accountId,
    amount: amount.toFixed(2),
    direction: input.direction,
    balance: updated.currentBalance.toFixed(2),
  };
}

// ─────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────

export interface OrderCashContext {
  orderId: string;
  orderNumber: string;
  paymentMethod: PaymentMethod;
  grandTotal: Money | number | string;
  actorId: string;
}

/**
 * Book a peşin order's money into the till. Called wherever an order becomes
 * CONFIRMED — at creation and at approval — because those are the two moments
 * the sale is agreed, and only one of them fires for any given order.
 */
export async function postOrderCashIn(
  tx: Tx,
  ctx: OrderCashContext,
): Promise<PostedMovement | null> {
  if (!settlesToCashAccount(ctx.paymentMethod)) return null;

  const accountId = await resolveAccountForMethod(tx, ctx.paymentMethod);
  return postCashMovement(tx, {
    accountId,
    direction: "IN",
    amount: ctx.grandTotal,
    source: "ORDER",
    description: `Sipariş ${ctx.orderNumber}`,
    orderId: ctx.orderId,
    recordedById: ctx.actorId,
  });
}

/**
 * Take a cancelled order's money back out of the till.
 *
 * Reads the entries that exist rather than recomputing from the payment method:
 * an order confirmed before this module shipped has none, and one whose binding
 * has since been re-pointed must be refunded from the account that actually
 * received it, not from wherever a new order would go today.
 */
export async function reverseOrderCash(
  tx: Tx,
  ctx: { orderId: string; orderNumber: string; actorId: string },
): Promise<void> {
  const entries = await tx.cashMovement.findMany({
    where: {
      orderId: ctx.orderId,
      source: "ORDER",
      direction: "IN",
      reversedBy: null,
    },
    select: { id: true, accountId: true, amount: true },
  });

  for (const entry of entries) {
    await postCashMovement(tx, {
      accountId: entry.accountId,
      direction: "OUT",
      amount: entry.amount,
      source: "ORDER",
      description: `Sipariş ${ctx.orderNumber} iptali`,
      orderId: ctx.orderId,
      reversalOfId: entry.id,
      recordedById: ctx.actorId,
    });
  }
}

// ─────────────────────────────────────────────
// COLLECTIONS
// ─────────────────────────────────────────────

export interface CollectionCashContext {
  transactionId: string;
  collectionMethod: Parameters<typeof entersCashAccount>[0];
  amount: Money | number | string;
  /** Chosen on the form; the default till when the caller did not ask. */
  accountId?: string | null;
  companyName: string;
  actorId: string;
}

/** Put a tahsilat into the till, when that method is money we can spend today. */
export async function postCollectionCashIn(
  tx: Tx,
  ctx: CollectionCashContext,
): Promise<PostedMovement | null> {
  if (!entersCashAccount(ctx.collectionMethod)) return null;

  const accountId = ctx.accountId ?? (await defaultAccountId(tx));
  return postCashMovement(tx, {
    accountId,
    direction: "IN",
    amount: ctx.amount,
    source: "COLLECTION",
    description: `Tahsilat — ${ctx.companyName}`,
    transactionId: ctx.transactionId,
    recordedById: ctx.actorId,
  });
}

/** Undo the till side of a reversed tahsilat, from the account that got it. */
export async function reverseCollectionCash(
  tx: Tx,
  ctx: { originalTransactionId: string; reversalTransactionId: string; actorId: string },
): Promise<void> {
  const entry = await tx.cashMovement.findUnique({
    where: { transactionId: ctx.originalTransactionId },
    select: { id: true, accountId: true, amount: true, reversedBy: { select: { id: true } } },
  });
  if (!entry || entry.reversedBy) return;

  await postCashMovement(tx, {
    accountId: entry.accountId,
    direction: "OUT",
    amount: entry.amount,
    source: "COLLECTION",
    description: "Tahsilat iptali",
    transactionId: ctx.reversalTransactionId,
    reversalOfId: entry.id,
    recordedById: ctx.actorId,
  });
}

// ─────────────────────────────────────────────
// ELLE GİRİŞ / ÇIKIŞ
// ─────────────────────────────────────────────

export interface ManualMovementInput {
  accountId: string;
  direction: CashDirection;
  amount: number;
  description: string;
  occurredAt?: string;
}

/** Kasa gideri, kasaya elle giriş: rent, fuel, a found difference. */
export async function recordManualMovement(
  input: ManualMovementInput,
  actorId: string,
): Promise<PostedMovement> {
  const description = input.description.trim();
  if (!description) {
    throw new BusinessError("INVALID_AMOUNT", "Açıklama zorunludur");
  }

  return prisma.$transaction((tx) =>
    postCashMovement(tx, {
      accountId: input.accountId,
      direction: input.direction,
      amount: input.amount,
      source: "MANUAL",
      description,
      occurredAt: parseOccurredAt(input.occurredAt),
      recordedById: actorId,
    }),
  );
}

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description?: string;
  occurredAt?: string;
}

export interface TransferResult {
  outMovementId: string;
  inMovementId: string;
  amount: string;
}

/**
 * Move money between accounts — kasadan bankaya yatırma being the daily case.
 *
 * Two entries, linked to each other. A single "transfer" row would force every
 * account statement to know that some rows count backwards depending on which
 * side is being read; two ordinary entries mean the kasa's ledger and the
 * bank's ledger each stay readable on their own.
 */
export async function transferBetweenAccounts(
  input: TransferInput,
  actorId: string,
): Promise<TransferResult> {
  if (input.fromAccountId === input.toAccountId) {
    throw new BusinessError("INVALID_AMOUNT", "Aynı hesaba aktarım yapılamaz");
  }
  const occurredAt = parseOccurredAt(input.occurredAt);

  return prisma.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.cashAccount.findUnique({
        where: { id: input.fromAccountId },
        select: { name: true },
      }),
      tx.cashAccount.findUnique({
        where: { id: input.toAccountId },
        select: { name: true },
      }),
    ]);
    if (!from || !to) {
      throw new BusinessError("CASH_ACCOUNT_NOT_FOUND", "Kasa/banka hesabı bulunamadı");
    }

    const note = input.description?.trim();
    const out = await postCashMovement(tx, {
      accountId: input.fromAccountId,
      direction: "OUT",
      amount: input.amount,
      source: "TRANSFER",
      description: note || `${to.name} hesabına aktarım`,
      occurredAt,
      recordedById: actorId,
    });
    const into = await postCashMovement(tx, {
      accountId: input.toAccountId,
      direction: "IN",
      amount: input.amount,
      source: "TRANSFER",
      description: note || `${from.name} hesabından aktarım`,
      occurredAt,
      recordedById: actorId,
    });

    // Linked after both exist: the counterpart of the first does not exist yet
    // while it is being written.
    await tx.cashMovement.update({
      where: { id: into.id },
      data: { counterpart: { connect: { id: out.id } } },
    });

    return { outMovementId: out.id, inMovementId: into.id, amount: out.amount };
  });
}

// ─────────────────────────────────────────────
// REVERSAL BY HAND
// ─────────────────────────────────────────────

export interface ReverseMovementResult {
  reversalId: string;
  amount: string;
  balance: string;
}

/**
 * Undo a hand-written entry with its opposite.
 *
 * Order and collection entries are refused here on purpose. Their till side is
 * one half of a pair — the other half is a cari row or an order status — and
 * reversing this half alone would leave the two ledgers disagreeing about the
 * same event. Those are undone by cancelling the order or the tahsilat, which
 * unwinds both sides together.
 */
export async function reverseCashMovement(
  params: { movementId: string; reason: string },
  actorId: string,
): Promise<ReverseMovementResult> {
  return prisma.$transaction(async (tx) => {
    const original = await tx.cashMovement.findUnique({
      where: { id: params.movementId },
      select: {
        id: true,
        accountId: true,
        amount: true,
        direction: true,
        source: true,
        reversalOfId: true,
        counterpartId: true,
        reversedBy: { select: { id: true } },
      },
    });
    if (!original) {
      throw new BusinessError("CASH_MOVEMENT_NOT_FOUND", "Kasa hareketi bulunamadı");
    }
    if (original.source === "ORDER" || original.source === "COLLECTION") {
      throw new BusinessError(
        "INVALID_STATE",
        "Sipariş/tahsilat kaynaklı hareket buradan iptal edilemez — siparişi veya tahsilatı iptal edin",
      );
    }
    if (original.reversalOfId) {
      throw new BusinessError("INVALID_STATE", "Bu kayıt zaten bir iptal kaydı");
    }
    if (original.reversedBy) {
      throw new BusinessError("INVALID_STATE", "Bu hareket zaten iptal edilmiş");
    }

    const reversal = await postCashMovement(tx, {
      accountId: original.accountId,
      direction: original.direction === "IN" ? "OUT" : "IN",
      amount: original.amount,
      source: original.source,
      description: `İptal: ${params.reason}`,
      reversalOfId: original.id,
      recordedById: actorId,
    });

    // A transfer is one event in two rows; undoing one leg alone would invent
    // money on the other side.
    const otherLegId = original.counterpartId ?? (await counterpartOf(tx, original.id));
    if (otherLegId) {
      const other = await tx.cashMovement.findUnique({
        where: { id: otherLegId },
        select: {
          id: true,
          accountId: true,
          amount: true,
          direction: true,
          source: true,
          reversedBy: { select: { id: true } },
        },
      });
      if (other && !other.reversedBy) {
        await postCashMovement(tx, {
          accountId: other.accountId,
          direction: other.direction === "IN" ? "OUT" : "IN",
          amount: other.amount,
          source: other.source,
          description: `İptal: ${params.reason}`,
          reversalOfId: other.id,
          recordedById: actorId,
        });
      }
    }

    return {
      reversalId: reversal.id,
      amount: reversal.amount,
      balance: reversal.balance,
    };
  });
}

/** The transfer leg pointing *at* this one (only one side stores the link). */
async function counterpartOf(tx: Tx, movementId: string): Promise<string | null> {
  const row = await tx.cashMovement.findUnique({
    where: { counterpartId: movementId },
    select: { id: true },
  });
  return row?.id ?? null;
}

function parseOccurredAt(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BusinessError("INVALID_AMOUNT", "Geçersiz tarih");
  }
  return d;
}

// ─────────────────────────────────────────────
// HESAP YÖNETİMİ
// ─────────────────────────────────────────────

export interface CashAccountRow {
  id: string;
  name: string;
  kind: CashAccountKind;
  currency: string;
  bankName: string | null;
  iban: string | null;
  openingBalance: string;
  currentBalance: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  /** Methods routed here, so the list explains where each order's money goes. */
  boundMethods: PaymentMethod[];
  movementCount: number;
}

export async function listCashAccounts(
  includeInactive = true,
): Promise<CashAccountRow[]> {
  const rows = await prisma.cashAccount.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      kind: true,
      currency: true,
      bankName: true,
      iban: true,
      openingBalance: true,
      currentBalance: true,
      isDefault: true,
      isActive: true,
      sortOrder: true,
      methodBindings: { select: { method: true } },
      _count: { select: { movements: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    currency: r.currency,
    bankName: r.bankName,
    iban: r.iban,
    openingBalance: r.openingBalance.toFixed(2),
    currentBalance: r.currentBalance.toFixed(2),
    isDefault: r.isDefault,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    boundMethods: r.methodBindings.map((b) => b.method),
    movementCount: r._count.movements,
  }));
}

export interface CashAccountInput {
  name: string;
  kind?: CashAccountKind;
  currency?: string;
  bankName?: string | null;
  iban?: string | null;
  openingBalance?: number;
  isActive?: boolean;
  sortOrder?: number;
}

export async function createCashAccount(input: CashAccountInput): Promise<string> {
  const opening = round2(new Dec(input.openingBalance ?? 0));
  return withUniqueName(async () => {
    const row = await prisma.cashAccount.create({
      data: {
        name: input.name.trim(),
        kind: input.kind ?? "CASH",
        currency: input.currency ?? "TRY",
        bankName: input.bankName?.trim() || null,
        iban: input.iban?.trim() || null,
        openingBalance: opening,
        // The devir is money that is already in the drawer, so the balance
        // starts there. It has no entry of its own — it predates the ledger.
        currentBalance: opening,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
      select: { id: true },
    });
    return row.id;
  });
}

export async function updateCashAccount(
  id: string,
  input: Partial<CashAccountInput>,
): Promise<void> {
  const account = await prisma.cashAccount.findUnique({
    where: { id },
    select: { isDefault: true },
  });
  if (!account) {
    throw new BusinessError("CASH_ACCOUNT_NOT_FOUND", "Kasa/banka hesabı bulunamadı");
  }
  // Closing the default would send the next unbound payment somewhere nobody
  // chose. Point the default elsewhere first, deliberately.
  if (input.isActive === false && account.isDefault) {
    throw new BusinessError(
      "LAST_CASH_ACCOUNT",
      "Varsayılan hesap kapatılamaz — önce başka bir hesabı varsayılan yapın",
    );
  }

  // openingBalance is not editable here on purpose: it is already summed into
  // currentBalance, and changing it would need a correcting entry to stay
  // honest. Correct a devir with a manual entry, which leaves a trace.
  await withUniqueName(() =>
    prisma.cashAccount.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.bankName !== undefined
          ? { bankName: input.bankName?.trim() || null }
          : {}),
        ...(input.iban !== undefined ? { iban: input.iban?.trim() || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    }),
  );
}

/**
 * Move the default flag, clearing the previous holder in the same transaction.
 *
 * "Exactly one" is enforced by a partial unique index the migration writes by
 * hand (`CashAccount_single_default_key`), because Prisma cannot express one —
 * the same treatment `Price_variant_default_tier_key` gets. This function only
 * has to clear before it sets; the database refuses the alternative.
 */
export async function setDefaultCashAccount(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const account = await tx.cashAccount.findUnique({
      where: { id },
      select: { isActive: true },
    });
    if (!account) {
      throw new BusinessError("CASH_ACCOUNT_NOT_FOUND", "Kasa/banka hesabı bulunamadı");
    }
    if (!account.isActive) {
      throw new BusinessError(
        "CASH_ACCOUNT_INACTIVE",
        "Kapalı hesap varsayılan yapılamaz",
      );
    }
    await tx.cashAccount.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
    await tx.cashAccount.update({ where: { id }, data: { isDefault: true } });
  });
}

export async function deleteCashAccount(id: string): Promise<void> {
  const account = await prisma.cashAccount.findUnique({
    where: { id },
    select: {
      isDefault: true,
      _count: { select: { movements: true } },
    },
  });
  if (!account) {
    throw new BusinessError("CASH_ACCOUNT_NOT_FOUND", "Kasa/banka hesabı bulunamadı");
  }
  if (account._count.movements > 0) {
    throw new BusinessError(
      "CASH_ACCOUNT_IN_USE",
      `${account._count.movements} hareketi olan hesap silinemez — kapatın`,
    );
  }
  if (account.isDefault) {
    throw new BusinessError(
      "LAST_CASH_ACCOUNT",
      "Varsayılan hesap silinemez — önce başka bir hesabı varsayılan yapın",
    );
  }
  await prisma.cashAccount.delete({ where: { id } });
}

// ─────────────────────────────────────────────
// YÖNTEM → HESAP EŞLEMESİ
// ─────────────────────────────────────────────

export interface MethodBinding {
  method: PaymentMethod;
  accountId: string | null;
  accountName: string | null;
  /** False for methods that never bring money in — açık hesap, çek. */
  settles: boolean;
}

export async function listMethodBindings(): Promise<MethodBinding[]> {
  const rows = await prisma.paymentMethodAccount.findMany({
    select: { method: true, account: { select: { id: true, name: true } } },
  });
  const byMethod = new Map(rows.map((r) => [r.method, r.account]));

  return (Object.keys(PAYMENT_METHOD_ORDER) as PaymentMethod[]).map((method) => {
    const account = byMethod.get(method) ?? null;
    return {
      method,
      accountId: account?.id ?? null,
      accountName: account?.name ?? null,
      settles: settlesToCashAccount(method),
    };
  });
}

/** Passing a null account removes the binding, sending that method to the default. */
export async function setMethodBinding(
  method: PaymentMethod,
  accountId: string | null,
): Promise<void> {
  if (accountId === null) {
    await prisma.paymentMethodAccount.deleteMany({ where: { method } });
    return;
  }
  const account = await prisma.cashAccount.findUnique({
    where: { id: accountId },
    select: { isActive: true },
  });
  if (!account) {
    throw new BusinessError("CASH_ACCOUNT_NOT_FOUND", "Kasa/banka hesabı bulunamadı");
  }
  if (!account.isActive) {
    throw new BusinessError("CASH_ACCOUNT_INACTIVE", "Kapalı hesap seçilemez");
  }
  await prisma.paymentMethodAccount.upsert({
    where: { method },
    create: { method, accountId },
    update: { accountId },
  });
}

/** Display order for the bindings screen — the enum's own order, named once. */
const PAYMENT_METHOD_ORDER: Record<PaymentMethod, true> = {
  CASH: true,
  BANK_TRANSFER: true,
  CREDIT_CARD: true,
  OPEN_ACCOUNT: true,
  CHEQUE: true,
};

// ─────────────────────────────────────────────
// DEFTERİ OKUMAK
// ─────────────────────────────────────────────

export interface CashMovementRow {
  id: string;
  accountId: string;
  accountName: string;
  direction: CashDirection;
  amount: string;
  source: CashMovementSource;
  description: string | null;
  occurredAt: string;
  orderId: string | null;
  orderNumber: string | null;
  recordedByName: string | null;
  /** Set when this entry has been undone; set the other way on the undo itself. */
  reversedById: string | null;
  reversalOfId: string | null;
}

export interface MovementFilter {
  accountId?: string;
  source?: CashMovementSource;
  direction?: CashDirection;
  from?: string;
  to?: string;
  limit?: number;
}

export async function listCashMovements(
  filter: MovementFilter = {},
): Promise<CashMovementRow[]> {
  const rows = await prisma.cashMovement.findMany({
    where: {
      ...(filter.accountId ? { accountId: filter.accountId } : {}),
      ...(filter.source ? { source: filter.source } : {}),
      ...(filter.direction ? { direction: filter.direction } : {}),
      ...occurredWithin(filter.from, filter.to),
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: Math.min(filter.limit ?? 100, 500),
    select: {
      id: true,
      accountId: true,
      account: { select: { name: true } },
      direction: true,
      amount: true,
      source: true,
      description: true,
      occurredAt: true,
      orderId: true,
      order: { select: { orderNumber: true } },
      recordedBy: { select: { name: true } },
      reversedBy: { select: { id: true } },
      reversalOfId: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    accountName: r.account.name,
    direction: r.direction,
    amount: r.amount.toFixed(2),
    source: r.source,
    description: r.description,
    occurredAt: r.occurredAt.toISOString(),
    orderId: r.orderId,
    orderNumber: r.order?.orderNumber ?? null,
    recordedByName: r.recordedBy?.name ?? null,
    reversedById: r.reversedBy?.id ?? null,
    reversalOfId: r.reversalOfId,
  }));
}

export interface CashSummaryLine {
  source: CashMovementSource;
  in: string;
  out: string;
  net: string;
}

export interface CashSummaryAccount {
  accountId: string;
  accountName: string;
  kind: CashAccountKind;
  in: string;
  out: string;
  net: string;
  /** Balance right now — not "at the end of the period". */
  currentBalance: string;
}

export interface CashSummary {
  from: string;
  to: string;
  totalIn: string;
  totalOut: string;
  net: string;
  bySource: CashSummaryLine[];
  byAccount: CashSummaryAccount[];
}

/**
 * Gün sonu: what came in, what went out, split by where and by why.
 *
 * Grouped in the database rather than by scanning rows into memory — the same
 * lesson the report engine learned in step 18. `currentBalance` is deliberately
 * today's balance and not a period-end one: reconstructing a balance as of a
 * past date needs every entry since, and the honest answer to "kasada ne var"
 * is the live number.
 */
export async function getCashSummary(range: {
  from?: string;
  to?: string;
}): Promise<CashSummary> {
  const { from, to } = dayRange(range.from, range.to);
  const where = { occurredAt: { gte: from, lt: to } };

  const [bySourceRows, byAccountRows, accounts] = await Promise.all([
    prisma.cashMovement.groupBy({
      by: ["source", "direction"],
      where,
      _sum: { amount: true },
    }),
    prisma.cashMovement.groupBy({
      by: ["accountId", "direction"],
      where,
      _sum: { amount: true },
    }),
    prisma.cashAccount.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        kind: true,
        currentBalance: true,
        isActive: true,
      },
    }),
  ]);

  const sourceTotals = new Map<CashMovementSource, { in: Money; out: Money }>();
  for (const row of bySourceRows) {
    const bucket = sourceTotals.get(row.source) ?? { in: new Dec(0), out: new Dec(0) };
    const amount = new Dec(row._sum.amount ?? 0);
    if (row.direction === "IN") bucket.in = bucket.in.add(amount);
    else bucket.out = bucket.out.add(amount);
    sourceTotals.set(row.source, bucket);
  }

  const accountTotals = new Map<string, { in: Money; out: Money }>();
  for (const row of byAccountRows) {
    const bucket = accountTotals.get(row.accountId) ?? { in: new Dec(0), out: new Dec(0) };
    const amount = new Dec(row._sum.amount ?? 0);
    if (row.direction === "IN") bucket.in = bucket.in.add(amount);
    else bucket.out = bucket.out.add(amount);
    accountTotals.set(row.accountId, bucket);
  }

  let totalIn = new Dec(0);
  let totalOut = new Dec(0);
  for (const bucket of sourceTotals.values()) {
    totalIn = totalIn.add(bucket.in);
    totalOut = totalOut.add(bucket.out);
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totalIn: totalIn.toFixed(2),
    totalOut: totalOut.toFixed(2),
    net: totalIn.minus(totalOut).toFixed(2),
    bySource: [...sourceTotals.entries()].map(([source, b]) => ({
      source,
      in: b.in.toFixed(2),
      out: b.out.toFixed(2),
      net: b.in.minus(b.out).toFixed(2),
    })),
    byAccount: accounts
      // A closed account with no movement in the period is noise; one with
      // movement still has to be shown or the totals will not add up.
      .filter((a) => a.isActive || accountTotals.has(a.id))
      .map((a) => {
        const b = accountTotals.get(a.id) ?? { in: new Dec(0), out: new Dec(0) };
        return {
          accountId: a.id,
          accountName: a.name,
          kind: a.kind,
          in: b.in.toFixed(2),
          out: b.out.toFixed(2),
          net: b.in.minus(b.out).toFixed(2),
          currentBalance: a.currentBalance.toFixed(2),
        };
      }),
  };
}

function occurredWithin(from?: string, to?: string) {
  if (!from && !to) return {};
  const range = dayRange(from, to);
  return { occurredAt: { gte: range.from, lt: range.to } };
}

/** `to` is inclusive of the whole day: a report for "today" must contain today. */
function dayRange(from?: string, to?: string): { from: Date; to: Date } {
  const start = from ? new Date(from) : startOfToday();
  const endInput = to ? new Date(to) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(endInput.getTime())) {
    throw new BusinessError("INVALID_AMOUNT", "Geçersiz tarih aralığı");
  }
  const end = new Date(
    endInput.getFullYear(),
    endInput.getMonth(),
    endInput.getDate() + 1,
  );
  return {
    from: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
    to: end,
  };
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

async function withUniqueName<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        throw new BusinessError(
          "CASH_ACCOUNT_NAME_TAKEN",
          "Bu isimde bir hesap zaten var",
        );
      }
      if (e.code === "P2025") {
        throw new BusinessError(
          "CASH_ACCOUNT_NOT_FOUND",
          "Kasa/banka hesabı bulunamadı",
        );
      }
    }
    throw e;
  }
}
