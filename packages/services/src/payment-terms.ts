import { Prisma, prisma } from "@repo/database";
import {
  COLLECTION_METHOD_LABELS,
  COLLECTION_METHOD_SETTLES,
  PAYMENT_METHOD_LABELS,
  PaymentMethodEnum,
  type CollectionMethod,
  type PaymentMethod,
} from "@repo/types";
import { BusinessError } from "./errors";

// Ödeme yöntemi ve vade: ne seçilebilir, ve seçilen ne anlama gelir.
//
// Three questions live here and nowhere else:
//  1. Which methods/terms may *this* customer pick? (Company restrictions.)
//  2. Does the chosen method create a cari receivable? (paymentMethodMeta.)
//  3. Does money actually reach a till when it is used? (Same table.)
//
// Question 2 used to be answered by `paymentMethod === "OPEN_ACCOUNT"` written
// out in four places. With five methods that would have become twenty
// comparisons, so it is a table now: adding a sixth method means adding one
// row, and the compiler names every screen that must decide what to do with it.

export interface PaymentMethodMeta {
  label: string;
  /**
   * True when the order is sold on credit: it is checked against the limit,
   * books a DEBIT on the cari and carries a vade. False means the money is
   * taken at order time and the cari ledger never hears about it.
   */
  createsReceivable: boolean;
  /**
   * True when confirming the order puts money into a kasa/banka account.
   *
   * Deliberately not written as `!createsReceivable`. They answer different
   * questions — one is about debt, the other about cash in hand — and a method
   * can say no to both: a consignment or a bank-guaranteed order books no
   * receivable and hands over no money either. Keeping them separate means such
   * a method is one row here instead of an exception everywhere.
   */
  settlesToCashAccount: boolean;
}

const META: Record<PaymentMethod, PaymentMethodMeta> = {
  OPEN_ACCOUNT: {
    label: PAYMENT_METHOD_LABELS.OPEN_ACCOUNT,
    createsReceivable: true,
    settlesToCashAccount: false,
  },
  // A cheque is a promise to pay later — cari debt with a vade, same as açık
  // hesap. Whether the cheque itself clears is the collection's problem.
  CHEQUE: {
    label: PAYMENT_METHOD_LABELS.CHEQUE,
    createsReceivable: true,
    settlesToCashAccount: false,
  },
  CREDIT_CARD: {
    label: PAYMENT_METHOD_LABELS.CREDIT_CARD,
    createsReceivable: false,
    settlesToCashAccount: true,
  },
  BANK_TRANSFER: {
    label: PAYMENT_METHOD_LABELS.BANK_TRANSFER,
    createsReceivable: false,
    settlesToCashAccount: true,
  },
  CASH: {
    label: PAYMENT_METHOD_LABELS.CASH,
    createsReceivable: false,
    settlesToCashAccount: true,
  },
};

export function paymentMethodMeta(method: PaymentMethod): PaymentMethodMeta {
  return META[method];
}

/** Does this order go on the cari, or is it paid at order time? */
export function createsReceivable(method: PaymentMethod): boolean {
  return META[method].createsReceivable;
}

/** Does confirming this order put money into a kasa/banka account? */
export function settlesToCashAccount(method: PaymentMethod): boolean {
  return META[method].settlesToCashAccount;
}

// ─────────────────────────────────────────────
// TAHSİLAT YÖNTEMİ: KASAYA GİRER Mİ?
// ─────────────────────────────────────────────

export interface CollectionMethodMeta {
  label: string;
  /**
   * True when the collection is money we can spend today.
   *
   * A cheque or a senet is not: the customer's debt is settled the moment we
   * accept it, but nothing has reached the till until it clears. Those
   * instruments belong in a çek/senet portföyü, which is a later step — until
   * then they settle the cari and leave the till alone, which is at least not
   * a lie.
   *
   * The table itself is in @repo/types, because the collection form reads it to
   * decide whether to ask which drawer the money went into and that form runs
   * in a browser. This is its accessor; nothing else may branch on a member.
   */
  entersCashAccount: boolean;
}

export function collectionMethodMeta(method: CollectionMethod): CollectionMethodMeta {
  return {
    label: COLLECTION_METHOD_LABELS[method],
    entersCashAccount: COLLECTION_METHOD_SETTLES[method],
  };
}

/** Does this collection put money into a kasa/banka account? */
export function entersCashAccount(method: CollectionMethod): boolean {
  return COLLECTION_METHOD_SETTLES[method];
}

export const ALL_PAYMENT_METHODS = PaymentMethodEnum.options;

// ─────────────────────────────────────────────
// WHAT THIS CUSTOMER MAY PICK
// ─────────────────────────────────────────────

export interface PaymentTermOption {
  id: string;
  name: string;
  days: number;
}

export interface PaymentOptions {
  methods: Array<{ value: PaymentMethod; label: string; createsReceivable: boolean }>;
  /** Empty when the customer has no menu — the default term applies silently. */
  terms: PaymentTermOption[];
  /** Company.paymentTermDays: what an order gets when no term is chosen. */
  defaultTermDays: number;
}

type CompanyTerms = {
  allowedPaymentMethods: PaymentMethod[];
  paymentTermDays: number;
  paymentTerms: Array<{ id: string; name: string; days: number }>;
};

/**
 * An empty `allowedPaymentMethods` means *no restriction*, not "nothing
 * allowed" — same convention as Announcement.customerGroupIds. Restricting a
 * customer is a deliberate act; existing rows were never asked, so they keep
 * everything.
 */
function methodsFor(company: { allowedPaymentMethods: PaymentMethod[] }): PaymentMethod[] {
  return company.allowedPaymentMethods.length > 0
    ? company.allowedPaymentMethods
    : ALL_PAYMENT_METHODS;
}

/** What to render in the checkout panel for one (already authorized) company. */
export async function getPaymentOptions(companyId: string): Promise<PaymentOptions> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      allowedPaymentMethods: true,
      paymentTermDays: true,
      paymentTerms: {
        where: { isActive: true },
        select: { id: true, name: true, days: true },
        orderBy: [{ sortOrder: "asc" }, { days: "asc" }],
      },
    },
  });
  if (!company) {
    throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı");
  }

  return {
    methods: methodsFor(company).map((value) => ({
      value,
      label: META[value].label,
      createsReceivable: META[value].createsReceivable,
    })),
    terms: company.paymentTerms,
    defaultTermDays: company.paymentTermDays,
  };
}

export interface ResolvedPaymentTerm {
  method: PaymentMethod;
  /** Snapshot written onto the order; null means "use the company's default". */
  paymentTermDays: number | null;
}

export interface ResolveTermInput {
  method: PaymentMethod;
  /** Id of an option from the customer's menu. */
  paymentTermId?: string | null;
  /** Free-form vade in days. Seller side only — a buyer cannot invent a term. */
  paymentTermDaysOverride?: number | null;
  /** SUPER_ADMIN / SALES_REP: they negotiate, so they may set days directly. */
  isSeller: boolean;
}

/**
 * Decide the method and vade an order is created with, rejecting anything the
 * customer was not offered.
 *
 * Called from `buildQuote`, which both the cart preview and order creation go
 * through — so a term the preview accepted is a term the order accepts, and a
 * buyer cannot skip the preview and post a method they were never shown.
 */
export function resolvePaymentTerm(
  company: CompanyTerms,
  input: ResolveTermInput,
): ResolvedPaymentTerm {
  if (!methodsFor(company).includes(input.method)) {
    throw new BusinessError(
      "PAYMENT_METHOD_NOT_ALLOWED",
      `Bu firma için ${META[input.method].label} ödeme yöntemi tanımlı değil`,
      { method: input.method },
    );
  }

  let days: number | null = null;

  if (input.paymentTermId) {
    const term = company.paymentTerms.find((t) => t.id === input.paymentTermId);
    if (!term) {
      throw new BusinessError(
        "PAYMENT_TERM_NOT_ALLOWED",
        "Seçilen vade bu firma için tanımlı değil",
        { paymentTermId: input.paymentTermId },
      );
    }
    days = term.days;
  } else if (input.paymentTermDaysOverride != null) {
    if (!input.isSeller) {
      // A buyer typing `paymentTermDays: 365` into the request would otherwise
      // grant itself a year of vade. Terms are picked from the menu, never typed.
      throw new BusinessError(
        "PAYMENT_TERM_NOT_ALLOWED",
        "Vade yalnızca tanımlı seçeneklerden seçilebilir",
      );
    }
    days = input.paymentTermDaysOverride;
  }

  // A vade is a promise to pay later; it is meaningless on an order that is
  // already paid. Silently dropping it would put a due date on a debt that does
  // not exist, so it is refused instead.
  if (days !== null && days > 0 && !createsReceivable(input.method)) {
    throw new BusinessError(
      "PAYMENT_TERM_NOT_ALLOWED",
      `${META[input.method].label} peşin bir ödemedir, vadeli seçilemez`,
      { method: input.method, days },
    );
  }

  return { method: input.method, paymentTermDays: days };
}

// ─────────────────────────────────────────────
// ADMIN: VADE TANIMLARI
// ─────────────────────────────────────────────

export interface PaymentTermRow extends PaymentTermOption {
  isActive: boolean;
  sortOrder: number;
  /** How many customers are offered this term — the delete guard reads it. */
  companyCount: number;
}

export async function listPaymentTerms(): Promise<PaymentTermRow[]> {
  const rows = await prisma.paymentTerm.findMany({
    orderBy: [{ sortOrder: "asc" }, { days: "asc" }],
    select: {
      id: true,
      name: true,
      days: true,
      isActive: true,
      sortOrder: true,
      _count: { select: { companies: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    days: r.days,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    companyCount: r._count.companies,
  }));
}

export interface PaymentTermInput {
  name: string;
  days: number;
  isActive?: boolean;
  sortOrder?: number;
}

export async function createPaymentTerm(
  input: PaymentTermInput,
): Promise<PaymentTermRow> {
  return withUniqueName(async () => {
    const row = await prisma.paymentTerm.create({
      data: {
        name: input.name.trim(),
        days: input.days,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? input.days,
      },
      select: { id: true, name: true, days: true, isActive: true, sortOrder: true },
    });
    return { ...row, companyCount: 0 };
  });
}

export async function updatePaymentTerm(
  id: string,
  input: Partial<PaymentTermInput>,
): Promise<PaymentTermRow> {
  return withUniqueName(async () => {
    const row = await prisma.paymentTerm.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.days !== undefined ? { days: input.days } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
      select: {
        id: true,
        name: true,
        days: true,
        isActive: true,
        sortOrder: true,
        _count: { select: { companies: true } },
      },
    });
    const { _count, ...rest } = row;
    return { ...rest, companyCount: _count.companies };
  });
}

/**
 * Deleting a term that customers are on would silently change what they may
 * pick next time, with no trace of why. Deactivating keeps the definition
 * readable next to the orders sold on it.
 */
export async function deletePaymentTerm(id: string): Promise<void> {
  const term = await prisma.paymentTerm.findUnique({
    where: { id },
    select: { _count: { select: { companies: true } } },
  });
  if (!term) {
    throw new BusinessError("PAYMENT_TERM_NOT_FOUND", "Vade tanımı bulunamadı");
  }
  if (term._count.companies > 0) {
    throw new BusinessError(
      "PAYMENT_TERM_IN_USE",
      `${term._count.companies} firmaya tanımlı vade silinemez — pasife alın`,
    );
  }
  await prisma.paymentTerm.delete({ where: { id } });
}

async function withUniqueName<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        throw new BusinessError(
          "PAYMENT_TERM_NAME_TAKEN",
          "Bu isimde bir vade tanımı zaten var",
        );
      }
      if (e.code === "P2025") {
        throw new BusinessError("PAYMENT_TERM_NOT_FOUND", "Vade tanımı bulunamadı");
      }
    }
    throw e;
  }
}
