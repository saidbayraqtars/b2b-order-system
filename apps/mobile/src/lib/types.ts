import type { OrderStatus, PaymentMethod } from "@repo/types";

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

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  OPEN_ACCOUNT: "Açık Hesap (Cari)",
  CREDIT_CARD: "Kredi Kartı",
};

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
