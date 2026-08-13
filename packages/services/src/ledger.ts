import { Prisma, prisma } from "@repo/database";
import { BASE_CURRENCY } from "@repo/types";
import type {
  AgingBucketKey,
  CollectionMethod,
  PaymentMethod,
  TransactionType,
} from "@repo/types";
import { BusinessError } from "./errors";
import { Dec, ZERO } from "./money";

// Cari ekstre (account statement) and aging.
//
// The ledger is the source of truth; Company.currentBalance is only a cache of
// it. Everything here reads the ledger and never writes, so a statement can
// always be used to check whether the cache has drifted.
//
// Company authorization happens at the route layer (resolveCompanyId).

// ─────────────────────────────────────────────
// STATEMENT
// ─────────────────────────────────────────────

export interface StatementRow {
  id: string;
  createdAt: string;
  type: TransactionType;
  description: string;
  paymentMethod: PaymentMethod | null;
  /** How a collection arrived (nakit, havale…). Null on order debt rows. */
  collectionMethod: CollectionMethod | null;
  /** Set when this row is the correcting entry that undid a collection. */
  reversalOfId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  recordedByName: string | null;
  /** Only one of the two is non-zero; the other is "0.00" so the table aligns. */
  debit: string;
  credit: string;
  /** Balance after this row, continuing from openingBalance. */
  balance: string;
}

export interface Statement {
  company: {
    id: string;
    name: string;
    /**
     * Her zaman TL — defterin para birimi, firmanın değil. Firmada bir
     * `currency` kolonu vardı ve ekstre onu basıyordu; "USD" işaretli bir
     * firmanın TL bakiyesi dolar diye basılıyordu. Alan burada duruyor çünkü
     * belge para birimini yazmak zorunda, ama kaynağı artık defter.
     */
    currency: string;
    creditLimit: string;
    /** The cached Company.currentBalance, for comparison against closingBalance. */
    currentBalance: string;
    paymentTermDays: number;
  };
  from: string | null;
  to: string | null;
  /** Net balance of everything before `from`. Zero when no `from` is given. */
  openingBalance: string;
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
  rows: StatementRow[];
}

export interface StatementRange {
  from?: string;
  to?: string;
}

export async function getStatement(
  companyId: string,
  range: StatementRange = {},
): Promise<Statement> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      creditLimit: true,
      currentBalance: true,
      paymentTermDays: true,
    },
  });
  if (!company) {
    throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı", { companyId });
  }

  const from = range.from ? startOfDay(new Date(range.from)) : null;
  const to = range.to ? endOfDay(new Date(range.to)) : null;

  const openingBalance = from
    ? await balanceBefore(companyId, from)
    : new Dec(0);

  const rows = await prisma.transaction.findMany({
    where: {
      companyId,
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    select: {
      id: true,
      createdAt: true,
      type: true,
      amount: true,
      description: true,
      paymentMethod: true,
      collectionMethod: true,
      reversalOfId: true,
      orderId: true,
      order: { select: { orderNumber: true } },
      recordedBy: { select: { name: true } },
    },
    // id breaks ties so two rows written in the same transaction (debit + its
    // reversal, for instance) always come back in a stable order.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  let running = openingBalance;
  let totalDebit = ZERO;
  let totalCredit = ZERO;

  const mapped: StatementRow[] = rows.map((r) => {
    const isDebit = r.type === "DEBIT";
    running = isDebit ? running.plus(r.amount) : running.minus(r.amount);
    if (isDebit) totalDebit = totalDebit.plus(r.amount);
    else totalCredit = totalCredit.plus(r.amount);

    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      type: r.type,
      description: r.description ?? (isDebit ? "Sipariş borcu" : "Tahsilat"),
      paymentMethod: r.paymentMethod,
      collectionMethod: r.collectionMethod,
      reversalOfId: r.reversalOfId,
      orderId: r.orderId,
      orderNumber: r.order?.orderNumber ?? null,
      recordedByName: r.recordedBy?.name ?? null,
      debit: isDebit ? r.amount.toFixed(2) : "0.00",
      credit: isDebit ? "0.00" : r.amount.toFixed(2),
      balance: running.toFixed(2),
    };
  });

  return {
    company: {
      id: company.id,
      name: company.name,
      currency: BASE_CURRENCY,
      creditLimit: company.creditLimit.toFixed(2),
      currentBalance: company.currentBalance.toFixed(2),
      paymentTermDays: company.paymentTermDays,
    },
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    openingBalance: openingBalance.toFixed(2),
    totalDebit: totalDebit.toFixed(2),
    totalCredit: totalCredit.toFixed(2),
    closingBalance: running.toFixed(2),
    rows: mapped,
  };
}

/** Net ledger position strictly before `date`. */
async function balanceBefore(
  companyId: string,
  date: Date,
): Promise<Prisma.Decimal> {
  const sums = await prisma.transaction.groupBy({
    by: ["type"],
    where: { companyId, createdAt: { lt: date } },
    _sum: { amount: true },
  });
  return netOf(sums);
}

function netOf(
  sums: { type: TransactionType; _sum: { amount: Prisma.Decimal | null } }[],
): Prisma.Decimal {
  const debit = sums.find((s) => s.type === "DEBIT")?._sum.amount ?? ZERO;
  const credit = sums.find((s) => s.type === "CREDIT")?._sum.amount ?? ZERO;
  return new Dec(debit).minus(credit);
}

// ─────────────────────────────────────────────
// AGING (yaşlandırma)
// ─────────────────────────────────────────────

export interface AgingBuckets {
  current: string;
  d1_30: string;
  d31_60: string;
  d61_90: string;
  d90_plus: string;
}

export interface CompanyAging {
  companyId: string;
  companyName: string;
  currency: string;
  creditLimit: string;
  /** Sum of the buckets minus unapplied credit — should equal currentBalance. */
  balance: string;
  /** Cached Company.currentBalance, so drift is visible instead of hidden. */
  cachedBalance: string;
  paymentTermDays: number;
  buckets: AgingBuckets;
  /** Everything at least one day past due. */
  overdue: string;
  /** Credit paid beyond all open debt (avans). Positive number, not netted in buckets. */
  unappliedCredit: string;
  /** Due date of the oldest still-open debit, if any. */
  oldestDueDate: string | null;
  salesRepId: string | null;
  salesRepName: string | null;
}

export interface ReceivablesReport {
  asOf: string;
  totals: AgingBuckets & { balance: string; overdue: string };
  companies: CompanyAging[];
}

/**
 * Age a single company's open debt.
 *
 * Open items are the DEBIT rows and payments are applied **FIFO** — the oldest
 * debt is settled first, which is how an open-account cari is normally reconciled
 * in Turkish practice.
 *
 * A debit falls due on its own `dueDate`, which the invoice stamps: the vade
 * starts with the fatura, not with the order. Rows written before invoicing
 * existed (and orders not yet invoiced) have no date of their own, so they fall
 * back to createdAt + the company's term — the behaviour this had before.
 */
export async function getCompanyAging(
  companyId: string,
  asOf: Date = new Date(),
): Promise<CompanyAging> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      creditLimit: true,
      currentBalance: true,
      paymentTermDays: true,
      salesRep: { select: { id: true, name: true } },
    },
  });
  if (!company) {
    throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı", { companyId });
  }

  const rows = await prisma.transaction.findMany({
    where: { companyId, createdAt: { lte: asOf } },
    select: {
      type: true,
      amount: true,
      createdAt: true,
      dueDate: true,
      order: { select: { paymentTermDays: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return ageRows(
    {
      id: company.id,
      name: company.name,
      currency: BASE_CURRENCY,
      creditLimit: company.creditLimit,
      currentBalance: company.currentBalance,
      paymentTermDays: company.paymentTermDays,
      salesRepId: company.salesRep?.id ?? null,
      salesRepName: company.salesRep?.name ?? null,
    },
    rows,
    asOf,
  );
}

/**
 * Aging across every company. `salesRepId` narrows it to one rep's portfolio so
 * the field app can show the same report without exposing other reps' accounts.
 */
export async function getReceivables(
  opts: { salesRepId?: string; asOf?: Date } = {},
): Promise<ReceivablesReport> {
  const asOf = opts.asOf ?? new Date();

  const companies = await prisma.company.findMany({
    where: {
      isActive: true,
      ...(opts.salesRepId ? { salesRepId: opts.salesRepId } : {}),
    },
    select: {
      id: true,
      name: true,
      creditLimit: true,
      currentBalance: true,
      paymentTermDays: true,
      salesRep: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  // One query for every company's ledger, then age in memory. The alternative —
  // a query per company — turns a 200-customer report into 200 round trips.
  const all = companies.length
    ? await prisma.transaction.findMany({
        where: {
          companyId: { in: companies.map((c) => c.id) },
          createdAt: { lte: asOf },
        },
        select: {
          companyId: true,
          type: true,
          amount: true,
          createdAt: true,
          dueDate: true,
          order: { select: { paymentTermDays: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    : [];

  const byCompany = new Map<string, typeof all>();
  for (const t of all) {
    const list = byCompany.get(t.companyId);
    if (list) list.push(t);
    else byCompany.set(t.companyId, [t]);
  }

  const aged = companies.map((c) =>
    ageRows(
      {
        id: c.id,
        name: c.name,
        currency: BASE_CURRENCY,
        creditLimit: c.creditLimit,
        currentBalance: c.currentBalance,
        paymentTermDays: c.paymentTermDays,
        salesRepId: c.salesRep?.id ?? null,
        salesRepName: c.salesRep?.name ?? null,
      },
      byCompany.get(c.id) ?? [],
      asOf,
    ),
  );

  const totals = aged.reduce(
    (acc, a) => ({
      current: acc.current.plus(a.buckets.current),
      d1_30: acc.d1_30.plus(a.buckets.d1_30),
      d31_60: acc.d31_60.plus(a.buckets.d31_60),
      d61_90: acc.d61_90.plus(a.buckets.d61_90),
      d90_plus: acc.d90_plus.plus(a.buckets.d90_plus),
      balance: acc.balance.plus(a.balance),
      overdue: acc.overdue.plus(a.overdue),
    }),
    {
      current: ZERO,
      d1_30: ZERO,
      d31_60: ZERO,
      d61_90: ZERO,
      d90_plus: ZERO,
      balance: ZERO,
      overdue: ZERO,
    },
  );

  return {
    asOf: asOf.toISOString(),
    totals: {
      current: totals.current.toFixed(2),
      d1_30: totals.d1_30.toFixed(2),
      d31_60: totals.d31_60.toFixed(2),
      d61_90: totals.d61_90.toFixed(2),
      d90_plus: totals.d90_plus.toFixed(2),
      balance: totals.balance.toFixed(2),
      overdue: totals.overdue.toFixed(2),
    },
    companies: aged,
  };
}

type AgingCompany = {
  id: string;
  name: string;
  currency: string;
  creditLimit: Prisma.Decimal;
  currentBalance: Prisma.Decimal;
  paymentTermDays: number;
  salesRepId: string | null;
  salesRepName: string | null;
};

type LedgerRow = {
  type: TransactionType;
  amount: Prisma.Decimal;
  createdAt: Date;
  /** Set by the invoice; null for debts that have not been invoiced yet. */
  dueDate: Date | null;
  /** The order this debt came from, when it came from one. */
  order: { paymentTermDays: number | null } | null;
};

/** FIFO settlement, then bucket whatever debt is left by days past due. */
function ageRows(
  company: AgingCompany,
  rows: LedgerRow[],
  asOf: Date,
): CompanyAging {
  const open: { due: Date; remaining: Prisma.Decimal }[] = [];
  let unapplied = ZERO;

  for (const row of rows) {
    if (row.type === "DEBIT") {
      // Best available answer, in order: the invoice's own due date; failing
      // that the vade the order was sold on; failing that the customer's
      // default. Reading the company term first would age a 60-day order as if
      // it were 30 just because that is what the customer usually gets.
      const termDays = row.order?.paymentTermDays ?? company.paymentTermDays;
      open.push({
        due: row.dueDate ?? addDays(row.createdAt, termDays),
        remaining: new Dec(row.amount),
      });
      continue;
    }

    // CREDIT: settle the oldest open debit first.
    let left = new Dec(row.amount);
    while (left.gt(0) && open.length > 0) {
      const head = open[0]!;
      if (head.remaining.gt(left)) {
        head.remaining = head.remaining.minus(left);
        left = ZERO;
      } else {
        left = left.minus(head.remaining);
        open.shift();
      }
    }
    // Paid more than was owed — carries forward as credit, not negative debt.
    if (left.gt(0)) unapplied = unapplied.plus(left);
  }

  const buckets = {
    current: ZERO,
    d1_30: ZERO,
    d31_60: ZERO,
    d61_90: ZERO,
    d90_plus: ZERO,
  };
  let overdue = ZERO;
  let oldestDue: Date | null = null;

  for (const item of open) {
    const key = bucketFor(daysBetween(item.due, asOf));
    buckets[key] = buckets[key].plus(item.remaining);
    if (key !== "current") overdue = overdue.plus(item.remaining);
    if (!oldestDue || item.due < oldestDue) oldestDue = item.due;
  }

  const openTotal = Object.values(buckets).reduce((a, b) => a.plus(b), ZERO);

  return {
    companyId: company.id,
    companyName: company.name,
    currency: BASE_CURRENCY,
    creditLimit: company.creditLimit.toFixed(2),
    balance: openTotal.minus(unapplied).toFixed(2),
    cachedBalance: company.currentBalance.toFixed(2),
    paymentTermDays: company.paymentTermDays,
    buckets: {
      current: buckets.current.toFixed(2),
      d1_30: buckets.d1_30.toFixed(2),
      d31_60: buckets.d31_60.toFixed(2),
      d61_90: buckets.d61_90.toFixed(2),
      d90_plus: buckets.d90_plus.toFixed(2),
    },
    overdue: overdue.toFixed(2),
    unappliedCredit: unapplied.toFixed(2),
    oldestDueDate: oldestDue ? (oldestDue as Date).toISOString() : null,
    salesRepId: company.salesRepId,
    salesRepName: company.salesRepName,
  };
}

function bucketFor(daysPastDue: number): AgingBucketKey {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "d1_30";
  if (daysPastDue <= 60) return "d31_60";
  if (daysPastDue <= 90) return "d61_90";
  return "d90_plus";
}

// ─────────────────────────────────────────────
// date helpers (local time — the operator reads these dates, not UTC)
// ─────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Whole days from `due` to `asOf`; negative while still within term. */
function daysBetween(due: Date, asOf: Date): number {
  return Math.floor((startOfDay(asOf).getTime() - startOfDay(due).getTime()) / DAY_MS);
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}
