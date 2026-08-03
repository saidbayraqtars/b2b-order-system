import type { Prisma } from "@repo/database";
import type {
  Aggregate,
  ColumnFormat,
  ReportDataset,
  Role,
} from "@repo/types";

// The dataset registry: the ONLY place a report field name may come from.
//
// A report definition is user data — it arrives over HTTP, it is stored as JSON,
// and it can be edited straight in the database. So nothing in it is trusted:
// every field name is looked up here, and anything not listed simply does not
// exist. No raw Prisma paths, no SQL, no dynamic property access from input.
//
// Row visibility is decided by `scope()` per dataset and role, and it is ANDed
// into the query after the user's own filters — a saved report can never widen
// what its runner is allowed to see.

export type ReportFieldType =
  | "string"
  | "number"
  | "money"
  | "date"
  | "enum"
  | "boolean";

export interface ReportFieldDef {
  /** Turkish label shown in the builder and as the default column header. */
  label: string;
  type: ReportFieldType;
  /** Dot path from the row root. Drives both the Prisma select and the read. */
  path: string;
  groupable?: boolean;
  /** Extra aggregates beyond the type's defaults. */
  aggregates?: readonly Aggregate[];
  enumValues?: readonly string[];
  format?: ColumnFormat;
  /**
   * Bucket a timestamp before grouping. Lets one underlying column appear as
   * "Tarih (gün)" and "Tarih (ay)" without a second database column.
   */
  trunc?: "day" | "month" | "year";
}

export interface ReportContext {
  userId: string;
  role: Role;
  companyId: string | null;
}

export interface DatasetDef {
  label: string;
  /** Prisma delegate key on the client. */
  model: "order" | "orderItem" | "transaction" | "company" | "checkIn";
  fields: Record<string, ReportFieldDef>;
  defaultSort: { field: string; direction: "asc" | "desc" };
  /** Row-level scope for this caller. `{}` means unrestricted. */
  scope: (ctx: ReportContext) => Record<string, unknown>;
}

const ORDER_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "PENDING_CREDIT",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REJECTED",
] as const;

const PAYMENT_METHODS = ["OPEN_ACCOUNT", "CREDIT_CARD"] as const;
const TRANSACTION_TYPES = ["DEBIT", "CREDIT"] as const;

/** A company user with no company matches nothing rather than everything. */
const ownCompany = (ctx: ReportContext) => ctx.companyId ?? "__none__";

// ─────────────────────────────────────────────
// shared field builders
// ─────────────────────────────────────────────

function dateParts(
  path: string,
  label: string,
): Record<string, ReportFieldDef> {
  return {
    [`${path.replace(/\./g, "_")}`]: {
      label,
      type: "date",
      path,
      format: "datetime",
    },
    [`${path.replace(/\./g, "_")}_day`]: {
      label: `${label} (gün)`,
      type: "string",
      path,
      groupable: true,
      trunc: "day",
    },
    [`${path.replace(/\./g, "_")}_month`]: {
      label: `${label} (ay)`,
      type: "string",
      path,
      groupable: true,
      trunc: "month",
    },
    [`${path.replace(/\./g, "_")}_year`]: {
      label: `${label} (yıl)`,
      type: "string",
      path,
      groupable: true,
      trunc: "year",
    },
  };
}

const money = (label: string, path: string): ReportFieldDef => ({
  label,
  type: "money",
  path,
  format: "money",
});

const text = (label: string, path: string, groupable = true): ReportFieldDef => ({
  label,
  type: "string",
  path,
  groupable,
});

// ─────────────────────────────────────────────
// datasets
// ─────────────────────────────────────────────

export const DATASETS: Record<ReportDataset, DatasetDef> = {
  ORDERS: {
    label: "Siparişler",
    model: "order",
    defaultSort: { field: "createdAt", direction: "desc" },
    fields: {
      orderNumber: text("Sipariş no", "orderNumber", false),
      status: {
        label: "Durum",
        type: "enum",
        path: "status",
        groupable: true,
        enumValues: ORDER_STATUSES,
      },
      paymentMethod: {
        label: "Ödeme yöntemi",
        type: "enum",
        path: "paymentMethod",
        groupable: true,
        enumValues: PAYMENT_METHODS,
      },
      ...dateParts("createdAt", "Sipariş tarihi"),
      ...dateParts("shippedAt", "Sevk tarihi"),
      ...dateParts("deliveredAt", "Teslim tarihi"),
      subtotal: money("Ara toplam", "subtotal"),
      discountTotal: money("İskonto", "discountTotal"),
      taxTotal: money("KDV", "taxTotal"),
      grandTotal: money("Genel toplam", "grandTotal"),
      companyName: text("Firma", "company.name"),
      customerGroupName: text("Müşteri grubu", "company.customerGroup.name"),
      salesRepName: text("Plasiyer", "company.salesRep.name"),
      createdByName: text("Siparişi giren", "createdBy.name"),
      carrier: text("Kargo firması", "carrier"),
      trackingNumber: text("Takip no", "trackingNumber", false),
      city: text("Sevk şehri", "shippingAddress.city"),
    },
    scope: (ctx) => {
      switch (ctx.role) {
        case "SUPER_ADMIN":
          return {};
        case "SALES_REP":
          return { company: { salesRepId: ctx.userId } };
        default:
          return { companyId: ownCompany(ctx) };
      }
    },
  },

  ORDER_ITEMS: {
    label: "Sipariş kalemleri",
    model: "orderItem",
    // The item table has no date of its own — it inherits the order's.
    defaultSort: { field: "order_createdAt", direction: "desc" },
    fields: {
      productName: text("Ürün", "productName"),
      sku: text("SKU", "sku"),
      quantity: { label: "Adet", type: "number", path: "quantity", format: "number" },
      unitPrice: money("Birim fiyat", "unitPrice"),
      discount: money("Birim iskonto", "discount"),
      lineTotal: money("Satır tutarı", "lineTotal"),
      vatRate: {
        label: "KDV oranı",
        type: "number",
        path: "vatRate",
        groupable: true,
        format: "number",
      },
      orderNumber: text("Sipariş no", "order.orderNumber", false),
      orderStatus: {
        label: "Sipariş durumu",
        type: "enum",
        path: "order.status",
        groupable: true,
        enumValues: ORDER_STATUSES,
      },
      ...dateParts("order.createdAt", "Sipariş tarihi"),
      companyName: text("Firma", "order.company.name"),
      salesRepName: text("Plasiyer", "order.company.salesRep.name"),
      brand: text("Marka", "variant.product.brand"),
      categoryName: text("Kategori", "variant.product.category.name"),
    },
    scope: (ctx) => {
      switch (ctx.role) {
        case "SUPER_ADMIN":
          return {};
        case "SALES_REP":
          return { order: { company: { salesRepId: ctx.userId } } };
        default:
          return { order: { companyId: ownCompany(ctx) } };
      }
    },
  },

  LEDGER: {
    label: "Cari defter",
    model: "transaction",
    defaultSort: { field: "createdAt", direction: "desc" },
    fields: {
      ...dateParts("createdAt", "Tarih"),
      type: {
        label: "Hareket tipi",
        type: "enum",
        path: "type",
        groupable: true,
        enumValues: TRANSACTION_TYPES,
      },
      amount: money("Tutar", "amount"),
      paymentMethod: {
        label: "Ödeme yöntemi",
        type: "enum",
        path: "paymentMethod",
        groupable: true,
        enumValues: PAYMENT_METHODS,
      },
      description: text("Açıklama", "description", false),
      companyName: text("Firma", "company.name"),
      salesRepName: text("Plasiyer", "company.salesRep.name"),
      recordedByName: text("Kaydeden", "recordedBy.name"),
      orderNumber: text("Sipariş no", "order.orderNumber", false),
    },
    scope: (ctx) => {
      switch (ctx.role) {
        case "SUPER_ADMIN":
          return {};
        case "SALES_REP":
          return { company: { salesRepId: ctx.userId } };
        default:
          return { companyId: ownCompany(ctx) };
      }
    },
  },

  COMPANIES: {
    label: "Firmalar",
    model: "company",
    defaultSort: { field: "name", direction: "asc" },
    fields: {
      name: text("Firma", "name"),
      taxNumber: text("Vergi no", "taxNumber", false),
      email: text("E-posta", "email", false),
      phone: text("Telefon", "phone", false),
      creditLimit: money("Kredi limiti", "creditLimit"),
      currentBalance: money("Güncel bakiye", "currentBalance"),
      paymentTermDays: {
        label: "Vade (gün)",
        type: "number",
        path: "paymentTermDays",
        groupable: true,
        format: "number",
      },
      currency: text("Para birimi", "currency"),
      isActive: { label: "Aktif", type: "boolean", path: "isActive", groupable: true },
      requiresOrderApproval: {
        label: "Sipariş onayı ister",
        type: "boolean",
        path: "requiresOrderApproval",
        groupable: true,
      },
      customerGroupName: text("Müşteri grubu", "customerGroup.name"),
      salesRepName: text("Plasiyer", "salesRep.name"),
      ...dateParts("createdAt", "Kayıt tarihi"),
    },
    scope: (ctx) => {
      switch (ctx.role) {
        case "SUPER_ADMIN":
          return {};
        case "SALES_REP":
          return { salesRepId: ctx.userId };
        default:
          return { id: ownCompany(ctx) };
      }
    },
  },

  CHECKINS: {
    label: "Ziyaretler",
    model: "checkIn",
    defaultSort: { field: "checkInAt", direction: "desc" },
    fields: {
      ...dateParts("checkInAt", "Ziyaret"),
      ...dateParts("checkOutAt", "Çıkış"),
      note: text("Not", "note", false),
      latitude: { label: "Enlem", type: "number", path: "latitude", format: "number" },
      longitude: { label: "Boylam", type: "number", path: "longitude", format: "number" },
      companyName: text("Firma", "company.name"),
      salesRepName: text("Plasiyer", "salesRep.name"),
    },
    scope: (ctx) => {
      switch (ctx.role) {
        case "SUPER_ADMIN":
          return {};
        case "SALES_REP":
          return { salesRepId: ctx.userId };
        default:
          return { companyId: ownCompany(ctx) };
      }
    },
  },
};

/** Aggregates a field may take, given its type. */
export function allowedAggregates(field: ReportFieldDef): Aggregate[] {
  const base: Aggregate[] = ["COUNT", "COUNT_DISTINCT"];
  if (field.type === "number" || field.type === "money") {
    return [...base, "SUM", "AVG", "MIN", "MAX"];
  }
  if (field.type === "date") return [...base, "MIN", "MAX"];
  return [...(field.aggregates ?? []), ...base];
}

/** Operators a field may be filtered with, given its type. */
export function allowedOperators(field: ReportFieldDef): string[] {
  const nullable = ["isNull", "notNull"];
  switch (field.type) {
    case "number":
    case "money":
      return ["eq", "neq", "gt", "gte", "lt", "lte", "between", ...nullable];
    case "date":
      return ["gte", "lte", "between", "lastNDays", ...nullable];
    case "enum":
      return ["eq", "neq", "in", "notIn", ...nullable];
    case "boolean":
      return ["eq"];
    default:
      return ["eq", "neq", "contains", "startsWith", "in", "notIn", ...nullable];
  }
}

/**
 * Registry description for the builder UI. Deliberately excludes `path` — the
 * client never needs to know how a field maps to the database, and not sending
 * it keeps the mapping from becoming a de-facto public contract.
 */
export function describeDatasets() {
  return Object.entries(DATASETS).map(([key, ds]) => ({
    key: key as ReportDataset,
    label: ds.label,
    defaultSort: ds.defaultSort,
    fields: Object.entries(ds.fields).map(([fieldKey, f]) => ({
      key: fieldKey,
      label: f.label,
      type: f.type,
      groupable: Boolean(f.groupable),
      aggregates: allowedAggregates(f),
      operators: allowedOperators(f),
      enumValues: f.enumValues ?? null,
      format: f.format ?? defaultFormat(f),
    })),
  }));
}

export function defaultFormat(field: ReportFieldDef): ColumnFormat {
  if (field.format) return field.format;
  switch (field.type) {
    case "money":
      return "money";
    case "number":
      return "number";
    case "date":
      return "datetime";
    default:
      return "text";
  }
}

/** Look a field up, or throw — callers must never fall back to the raw name. */
export function fieldOf(
  dataset: ReportDataset,
  key: string,
): ReportFieldDef | undefined {
  return DATASETS[dataset].fields[key];
}

/**
 * Turn a set of dot paths into a nested Prisma select.
 * `["company.salesRep.name"]` → `{ company: { select: { salesRep: { select: { name: true } } } } }`
 */
export function buildSelect(paths: string[]): Prisma.JsonObject {
  const root: Record<string, unknown> = {};

  for (const path of paths) {
    const parts = path.split(".");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLeaf = i === parts.length - 1;
      if (isLeaf) {
        // A relation already claimed this key (e.g. both "company" and
        // "company.name" requested) — the nested select is the stronger one.
        if (typeof node[part] !== "object") node[part] = true;
        continue;
      }
      const existing = node[part];
      if (!existing || typeof existing !== "object") {
        node[part] = { select: {} };
      }
      node = (node[part] as { select: Record<string, unknown> }).select;
    }
  }

  return root as Prisma.JsonObject;
}

/** Safe nested read. Returns undefined rather than throwing on a missing link. */
export function readPath(row: unknown, path: string): unknown {
  let cur: unknown = row;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
