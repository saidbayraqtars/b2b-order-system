import { z } from "zod";

// Single edge-safe source of truth for role/status literals.
// Names MUST match the Prisma enums in packages/database/prisma/schema.prisma.

export const RoleEnum = z.enum([
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
  "SALES_REP",
  /**
   * Malı kapıya götüren kişi. Plasiyerden ayrı bir rol, çünkü işi de yetkisi de
   * farklı: sipariş girmez, fiyat görmez, tahsilat yapmaz — kendisine düşen
   * sevkiyatı teslim eder ve imzalı belgenin fotoğrafını yükler.
   */
  "COURIER",
]);
export type Role = z.infer<typeof RoleEnum>;

export const OrderStatusEnum = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "PENDING_CREDIT",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REJECTED",
]);
export type OrderStatus = z.infer<typeof OrderStatusEnum>;

/**
 * How an order is agreed to be settled.
 *
 * Which of these create a cari receivable is decided in one place —
 * `paymentMethodMeta()` in @repo/services. Nothing else may branch on a
 * specific member, or adding the next method means hunting for `=== "..."`.
 */
export const PaymentMethodEnum = z.enum([
  "OPEN_ACCOUNT",
  "CREDIT_CARD",
  "BANK_TRANSFER",
  "CASH",
  "CHEQUE",
]);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  OPEN_ACCOUNT: "Açık hesap (cari)",
  CREDIT_CARD: "Kredi kartı",
  BANK_TRANSFER: "Havale / EFT",
  CASH: "Nakit",
  CHEQUE: "Çek",
};

export const TransactionTypeEnum = z.enum(["DEBIT", "CREDIT"]);
export type TransactionType = z.infer<typeof TransactionTypeEnum>;

/**
 * How a collection reached us. Still separate from PaymentMethod even though
 * several member names now coincide: this records money that has already moved,
 * the other records what an order *agreed* to and is read by the credit check,
 * approval and promotion rules. One enum for both would drag every new
 * collection channel into the order engine.
 */
export const CollectionMethodEnum = z.enum([
  "CASH",
  "BANK_TRANSFER",
  "CHEQUE",
  "PROMISSORY_NOTE",
  "CREDIT_CARD",
  "OTHER",
]);
export type CollectionMethod = z.infer<typeof CollectionMethodEnum>;

export const COLLECTION_METHOD_LABELS: Record<CollectionMethod, string> = {
  CASH: "Nakit",
  BANK_TRANSFER: "Havale / EFT",
  CHEQUE: "Çek",
  PROMISSORY_NOTE: "Senet",
  CREDIT_CARD: "Kredi kartı",
  OTHER: "Diğer",
};

/**
 * Which collections are money we can spend today, and therefore land in a
 * kasa/banka account.
 *
 * A cheque or a senet is not: accepting it settles the customer's debt, but
 * nothing has reached the till until it clears, and counting it as cash would
 * report a balance the safe does not contain.
 *
 * This table lives here rather than beside its PaymentMethod sibling in
 * @repo/services because the collection form has to read it — it decides
 * whether to ask which drawer the money went into — and that form runs in a
 * browser, where the services package cannot go. `entersCashAccount()` in
 * @repo/services is the accessor; nothing else may branch on a member by name.
 */
export const COLLECTION_METHOD_SETTLES: Record<CollectionMethod, boolean> = {
  CASH: true,
  BANK_TRANSFER: true,
  CREDIT_CARD: true,
  CHEQUE: false,
  PROMISSORY_NOTE: false,
  // "Diğer" is whatever the operator could not name — mahsup, barter, a
  // correction. Not assumed to be money.
  OTHER: false,
};

/**
 * Where money we hold physically sits.
 *
 * POS is its own kind on purpose: a card sale is money we have earned but do
 * not have yet, and mixing it into the bank balance would make the bank line
 * disagree with the bank's own statement until the provider settles.
 */
export const CashAccountKindEnum = z.enum(["CASH", "BANK", "POS"]);
export type CashAccountKind = z.infer<typeof CashAccountKindEnum>;

export const CASH_ACCOUNT_KIND_LABELS: Record<CashAccountKind, string> = {
  CASH: "Kasa",
  BANK: "Banka hesabı",
  POS: "POS / sanal POS",
};

export const CashDirectionEnum = z.enum(["IN", "OUT"]);
export type CashDirection = z.infer<typeof CashDirectionEnum>;

export const CASH_DIRECTION_LABELS: Record<CashDirection, string> = {
  IN: "Giriş",
  OUT: "Çıkış",
};

/** Why a till entry exists. Reports group by it. */
export const CashMovementSourceEnum = z.enum([
  "ORDER",
  "COLLECTION",
  "MANUAL",
  "TRANSFER",
  /**
   * Vadesi gelip tahsil edilen çek/senet. Tahsilattan ayrı bir kaynak: para
   * bugün girdi ama borç aylar önce kapanmıştı, ve gün sonu ikisini aynı
   * satırda göstermemeli.
   */
  "CHEQUE",
]);
export type CashMovementSource = z.infer<typeof CashMovementSourceEnum>;

export const CASH_MOVEMENT_SOURCE_LABELS: Record<CashMovementSource, string> = {
  ORDER: "Peşin sipariş",
  COLLECTION: "Tahsilat",
  MANUAL: "Elle giriş",
  TRANSFER: "Hesaplar arası aktarım",
  CHEQUE: "Çek/senet tahsili",
};

/**
 * Where a card payment is in its life.
 *
 * Provider-agnostic on purpose: iyzico, PayTR and a bank VPOS each have their
 * own words for these five states, and the order pipeline must not learn any of
 * their vocabularies. Only `CAPTURED` writes money into a till.
 */
export const PaymentIntentStatusEnum = z.enum([
  "PENDING",
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
]);
export type PaymentIntentStatus = z.infer<typeof PaymentIntentStatusEnum>;

export const PAYMENT_INTENT_STATUS_LABELS: Record<PaymentIntentStatus, string> = {
  PENDING: "Onay bekliyor",
  AUTHORIZED: "Provizyon alındı",
  CAPTURED: "Tahsil edildi",
  FAILED: "Başarısız",
  CANCELLED: "İptal edildi",
  REFUNDED: "İade edildi",
};

/**
 * Saha hedefinin hangi büyüklüğü ölçtüğü.
 *
 * İkisi ayrı satırlar, tek bir "hedef" satırının iki kolonu değil: bir
 * temsilciye yalnızca ziyaret hedefi konması sık rastlanan bir durum ve boş
 * bırakılmış ciro kolonu "hedef yok" mu "hedef sıfır" mı belli olmazdı.
 */
export const TargetMetricEnum = z.enum(["VISITS", "REVENUE"]);
export type TargetMetric = z.infer<typeof TargetMetricEnum>;

export const TARGET_METRIC_LABELS: Record<TargetMetric, string> = {
  VISITS: "Ziyaret noktası",
  REVENUE: "Ciro",
};

export const TargetPeriodEnum = z.enum([
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
]);
export type TargetPeriod = z.infer<typeof TargetPeriodEnum>;

export const TARGET_PERIOD_LABELS: Record<TargetPeriod, string> = {
  DAILY: "Günlük",
  WEEKLY: "Haftalık",
  MONTHLY: "Aylık",
  YEARLY: "Yıllık",
};

/** Bayinin "uğrayın" çağrısının durumu. */
export const VisitRequestStatusEnum = z.enum([
  "OPEN",
  "PLANNED",
  "DONE",
  "CANCELLED",
]);
export type VisitRequestStatus = z.infer<typeof VisitRequestStatusEnum>;

export const VISIT_REQUEST_STATUS_LABELS: Record<VisitRequestStatus, string> = {
  OPEN: "Bekliyor",
  PLANNED: "Güne alındı",
  DONE: "Ziyaret edildi",
  CANCELLED: "İptal",
};

/** Etiket/fiş şablonunun hangi iş için basıldığı. */
export const LabelTemplateKindEnum = z.enum([
  "CARGO_LABEL",
  "ORDER_RECEIPT",
  "DELIVERY_RECEIPT",
]);
export type LabelTemplateKind = z.infer<typeof LabelTemplateKindEnum>;

export const LABEL_TEMPLATE_KIND_LABELS: Record<LabelTemplateKind, string> = {
  CARGO_LABEL: "Kargo etiketi",
  ORDER_RECEIPT: "Sipariş fişi (80 mm)",
  DELIVERY_RECEIPT: "Teslim fişi (80 mm)",
};

/** Which application wrote a field record (visit, collection). */
export const FieldEntrySourceEnum = z.enum(["MOBILE", "WEB"]);
export type FieldEntrySource = z.infer<typeof FieldEntrySourceEnum>;

export const DiscountTypeEnum = z.enum(["PERCENTAGE", "FIXED"]);
export type DiscountType = z.infer<typeof DiscountTypeEnum>;

/**
 * Whether a customer's hacim (turnover) tier is earned from its own orders or
 * granted by an admin. Under MANUAL the pinned tier is the whole answer and
 * turnover is never consulted — including "pinned to nothing", which is how the
 * ladder is switched off for a single cari.
 */
export const VolumeDiscountModeEnum = z.enum(["AUTO", "MANUAL"]);
export type VolumeDiscountMode = z.infer<typeof VolumeDiscountModeEnum>;

export const VOLUME_DISCOUNT_MODE_LABELS: Record<VolumeDiscountMode, string> = {
  AUTO: "Otomatik (ciroya göre)",
  MANUAL: "Elle atanmış",
};
