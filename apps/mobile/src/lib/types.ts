import type {
  CollectionMethod,
  OrderStatus,
  PaymentMethod,
  Role,
  TargetMetric,
  TargetPeriod,
  VisitRequestStatus,
} from "@repo/types";

// Shapes returned by the Next.js API in apps/web. Kept as hand-written types
// (rather than importing the service layer) so the app never pulls in Prisma.
// Money always crosses the wire as a fixed-2 string.

export interface Company {
  id: string;
  name: string;
  phone: string | null;
  creditLimit: string;
  currentBalance: string;
  availableCredit: string;
  currency: string;
  city: string | null;
  district: string | null;
}

export interface CatalogVariant {
  id: string;
  sku: string;
  barcode: string | null;
  color: string | null;
  size: string | null;
  unitsPerCase: number;
  moqUnits: number;
  stock: number;
  /** null when no price applies to this company — variant is not orderable. */
  unitPrice: string | null;
  discountPerUnit: string | null;
  netUnitPrice: string | null;
  /**
   * The currency the price was *listed* in. Every amount above is already TRY;
   * this only prints the "≈ 12,50 USD" note for a customer who agreed a price
   * in foreign money and wants to see which figure it was converted from.
   */
  listCurrency: string | null;
  listUnitPrice: string | null;
}

export interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  images: string[];
  vatRate: number;
  categoryId: string;
  variants: CatalogVariant[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  children: Category[];
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  grandTotal: string;
  createdAt: string;
  company: { id: string; name: string };
  createdBy: { id: string; name: string };
  _count: { items: number };
}

export interface OrderDetailItem {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: string;
  discount: string;
  vatRate: number;
  lineTotal: string;
}

export interface OrderStatusEvent {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedByName: string;
  note: string | null;
  createdAt: string;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  currency: string;
  /** Vade in days, company default already folded in. 0 = peşin. */
  paymentTermDays: number;
  /** The hacim rung this order was sold under, snapshotted at order time. */
  volumeTier: { name: string; percent: string } | null;
  note: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  createdAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  company: { id: string; name: string };
  createdByName: string;
  approvedByName: string | null;
  shippingAddress: {
    label: string;
    line1: string;
    city: string;
    district: string | null;
  } | null;
  items: OrderDetailItem[];
  history: OrderStatusEvent[];
  availableTransitions: OrderStatus[];
}

export interface CheckInRecord {
  id: string;
  companyId: string;
  companyName: string;
  latitude: number | null;
  longitude: number | null;
  checkInAt: string;
  checkOutAt: string | null;
  note: string | null;
  /** Hangi uygulamadan yazıldı — sunucu belirler, istemci gönderemez. */
  source: "MOBILE" | "WEB";
}

export interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  grandTotal: string;
}

/** What POST /api/orders/quote answers: the priced cart, campaigns included. */
export interface OrderQuote {
  lines: Array<{
    variantId: string;
    sku: string;
    productName: string;
    quantity: number;
    unitPrice: string;
    discountPerUnit: string;
    promotionDiscount: string;
    lineNet: string;
    vatRate: number;
    isGift: boolean;
  }>;
  subtotal: string;
  discountTotal: string;
  promotionTotal: string;
  shippingFee: string;
  taxTotal: string;
  grandTotal: string;
  promotions: Array<{
    promotionId: string;
    name: string;
    code: string | null;
    amount: string;
  }>;
  coupon: string | null;
  /** The settlement the quote was priced under, after the server validated it. */
  paymentMethod: PaymentMethod;
  /** Vade in days including the company default — 0 means peşin. */
  paymentTermDays: number;
  createsReceivable: boolean;
  /**
   * The hacim rung folded into this price. `amount` is already inside
   * `discountTotal` — the cart names it, it must not subtract it again.
   */
  volumeDiscount: { tierName: string; percent: string; amount: string } | null;
}

export interface RecordPaymentResult {
  transactionId: string;
  amount: string;
  newBalance: string;
}

/** Turkish labels for order statuses (mirrors the web portal). */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Taslak",
  PENDING_APPROVAL: "Onay Bekliyor",
  PENDING_CREDIT: "Limit Bekliyor",
  CONFIRMED: "Onaylandı",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Sevk Edildi",
  DELIVERED: "Teslim Edildi",
  CANCELLED: "İptal",
  REJECTED: "Reddedildi",
};

// Payment method labels are NOT defined here. This file used to keep its own
// copy, which silently fell behind when the enum grew from two members to five.
// Screens import PAYMENT_METHOD_LABELS from @repo/types instead — one map, next
// to the enum, so the compiler catches the next new method everywhere at once.

/** What GET /api/payment-options answers: this customer's checkout menu. */
export interface PaymentOptions {
  methods: Array<{
    value: PaymentMethod;
    label: string;
    /** True when picking it books cari debt rather than being paid at once. */
    createsReceivable: boolean;
  }>;
  /** Empty means the customer has no choice — `defaultTermDays` applies silently. */
  terms: Array<{ id: string; name: string; days: number }>;
  defaultTermDays: number;
}

// ── Cari ekstre / yaşlandırma (mirrors @repo/services ledger types) ──

export interface StatementRow {
  id: string;
  createdAt: string;
  type: "DEBIT" | "CREDIT";
  description: string;
  paymentMethod: PaymentMethod | null;
  orderId: string | null;
  orderNumber: string | null;
  recordedByName: string | null;
  debit: string;
  credit: string;
  balance: string;
}

export interface Statement {
  company: {
    id: string;
    name: string;
    currency: string;
    creditLimit: string;
    currentBalance: string;
    paymentTermDays: number;
  };
  from: string | null;
  to: string | null;
  openingBalance: string;
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
  rows: StatementRow[];
}

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
  balance: string;
  cachedBalance: string;
  paymentTermDays: number;
  buckets: AgingBuckets;
  overdue: string;
  unappliedCredit: string;
  oldestDueDate: string | null;
  salesRepId: string | null;
  salesRepName: string | null;
}

// ── Sepet (sunucuda) ──

/**
 * A cart line as the server reports it.
 *
 * The row itself stores only variant + quantity; price, stock and VAT come
 * from the read, so a cart left overnight shows this morning's price rather
 * than yesterday's. `netUnitPrice` is null when the company has no applicable
 * price — the line is in the basket but cannot be ordered.
 */
export interface CartLine {
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  color: string | null;
  size: string | null;
  unitsPerCase: number;
  moqUnits: number;
  stock: number;
  vatRate: number;
  quantity: number;
  netUnitPrice: string | null;
  image: string | null;
}

export interface CartView {
  companyId: string;
  updatedAt: string | null;
  lines: CartLine[];
}

// ── Saha operasyonu ──

/** Bayinin açtığı "uğrayın" çağrısı, plasiyerin gördüğü sırayla. */
export interface VisitRequestRow {
  id: string;
  companyId: string;
  companyName: string;
  city: string | null;
  district: string | null;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  salesRepId: string | null;
  requestedFor: string | null;
  note: string | null;
  status: VisitRequestStatus;
  sortIndex: number;
  createdAt: string;
  completedAt: string | null;
}

/**
 * Hedef karnesi.
 *
 * `elapsed` dönemin ne kadarının geçtiği (0–1). Yüzdeyi tek başına göstermek
 * yanıltıcı: ayın ilk günü %10 iyidir, son günü felakettir.
 */
export interface TargetProgress {
  id: string;
  salesRepId: string;
  salesRepName: string;
  metric: TargetMetric;
  period: TargetPeriod;
  periodStart: string;
  periodEnd: string;
  targetValue: string;
  note: string | null;
  achieved: string;
  percent: number;
  elapsed: number;
}

/** Kuryenin listesindeki tek iş — bir sevkiyat. */
export interface DeliveryRow {
  shipmentId: string;
  documentNumber: string;
  orderId: string;
  orderNumber: string;
  companyName: string;
  companyPhone: string | null;
  addressLine: string | null;
  city: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  shippedAt: string;
  courierId: string | null;
  courierName: string | null;
  deliveredAt: string | null;
  receivedByName: string | null;
  proofPhotoUrl: string | null;
  deliveryNote: string | null;
  itemCount: number;
  grandTotal: string;
}

export interface Courier {
  id: string;
  name: string;
  email: string;
}

/** Kasa/banka hesabı — tahsilat seçicisi. Bakiye taşımaz, taşımamalı. */
export interface CashAccount {
  id: string;
  name: string;
  kind: "CASH" | "BANK" | "POS";
  isDefault: boolean;
}

/**
 * Çek/senet künyesi as it goes over the wire.
 *
 * Not `ChequeDetailsInput` from @repo/types: that type is the schema's *output*,
 * where `dueDate` has already been coerced to a Date. JSON has no Date, so the
 * device sends an ISO string and the server coerces it — the same field, one
 * step earlier in its life.
 */
export interface ChequeDetails {
  kind?: "CHEQUE" | "PROMISSORY_NOTE";
  serialNumber?: string;
  bankName?: string;
  branchName?: string;
  /** Keşideci — kâğıdı imzalayan. Müşterinin kendi çeki olmak zorunda değil. */
  drawerName?: string;
  dueDate?: string;
  notes?: string;
}

/** Kaydedilmiş tahsilat (GET /api/payments). */
export interface PaymentRow {
  id: string;
  companyId: string;
  companyName: string;
  amount: string;
  collectionMethod: CollectionMethod | null;
  description: string | null;
  recordedByName: string | null;
  createdAt: string;
  /** Set when this collection has been undone by a correcting entry. */
  reversedById: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  placement: string;
  tone: string;
  dismissible: boolean;
  priority: number;
}

export interface AccountProfile {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  company: { id: string; name: string } | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
}
