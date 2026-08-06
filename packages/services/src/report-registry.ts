import type { Prisma } from "@repo/database";
import { PaymentMethodEnum } from "@repo/types";
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
  /**
   * Which table this field really comes from, e.g. "Firma" or "Ürün".
   *
   * Reports read one dataset, but that dataset reaches across relations the
   * registry declares — so the builder groups fields by source and a user picks
   * "Firma → Müşteri grubu" without ever writing a join. Absent means the
   * dataset's own table.
   */
  source?: string;
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

/**
 * How a dataset maps onto tables, so a grouped report can be answered by the
 * database instead of by reading rows into memory.
 *
 * Every identifier here is written in this file. None of it can come from a
 * report definition: the builder resolves a field name to a `ReportFieldDef`
 * first, and only then does the SQL layer turn that definition's `path` into a
 * column using the aliases below. There is no route from user input to an
 * identifier — values always travel as bound parameters.
 */
export interface DatasetSql {
  /** Base table, unquoted (Prisma's default naming: the model name). */
  table: string;
  alias: string;
  /**
   * One entry per relation path that any field or scope reaches through, in
   * dependency order. `on` references only aliases declared here.
   *
   * All joins are LEFT JOINs of to-one relations, so they can add columns but
   * never rows — a row count stays a row count.
   */
  joins: ReadonlyArray<{
    /** Relation path from the base row, e.g. "order.company". */
    prefix: string;
    table: string;
    alias: string;
    on: string;
  }>;
}

export interface DatasetDef {
  label: string;
  /** Prisma delegate key on the client. */
  model: "order" | "orderItem" | "transaction" | "company" | "checkIn";
  sql: DatasetSql;
  fields: Record<string, ReportFieldDef>;
  defaultSort: { field: string; direction: "asc" | "desc" };
  /**
   * Row-level scope for this caller. `{}` means unrestricted.
   *
   * Written as a Prisma filter and translated to SQL for grouped reports, so
   * both paths read one declaration — a scope that only existed on one of them
   * would be a hole waiting for the day someone groups a report.
   */
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

const PAYMENT_METHODS = PaymentMethodEnum.options;
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

const money = (label: string, path: string, source?: string): ReportFieldDef => ({
  label,
  type: "money",
  path,
  format: "money",
  ...(source ? { source } : {}),
});

const text = (
  label: string,
  path: string,
  groupable = true,
  source?: string,
): ReportFieldDef => ({
  label,
  type: "string",
  path,
  groupable,
  ...(source ? { source } : {}),
});

// ─────────────────────────────────────────────
// datasets
// ─────────────────────────────────────────────

export const DATASETS: Record<ReportDataset, DatasetDef> = {
  ORDERS: {
    label: "Siparişler",
    model: "order",
    sql: {
      table: "Order",
      alias: "o",
      joins: [
        { prefix: "company", table: "Company", alias: "c", on: 'c."id" = o."companyId"' },
        {
          prefix: "company.customerGroup",
          table: "CustomerGroup",
          alias: "cg",
          on: 'cg."id" = c."customerGroupId"',
        },
        {
          prefix: "company.salesRep",
          table: "User",
          alias: "csr",
          on: 'csr."id" = c."salesRepId"',
        },
        { prefix: "createdBy", table: "User", alias: "cb", on: 'cb."id" = o."createdById"' },
        {
          prefix: "shippingAddress",
          table: "Address",
          alias: "sa",
          on: 'sa."id" = o."shippingAddressId"',
        },
      ],
    },
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
      volumeTierName: text("Hacim basamağı", "volumeTierName", true),
      volumeDiscountPercent: {
        label: "Hacim iskontosu %",
        type: "number",
        path: "volumeDiscountPercent",
        groupable: true,
        format: "percent",
      },
      ...dateParts("createdAt", "Sipariş tarihi"),
      ...dateParts("shippedAt", "Sevk tarihi"),
      ...dateParts("deliveredAt", "Teslim tarihi"),
      subtotal: money("Ara toplam", "subtotal"),
      discountTotal: money("İskonto", "discountTotal"),
      taxTotal: money("KDV", "taxTotal"),
      grandTotal: money("Genel toplam", "grandTotal"),
      promotionTotal: money("Kampanya indirimi", "promotionTotal"),
      shippingFee: money("Nakliye", "shippingFee"),
      shippingDiscount: money("Nakliye indirimi", "shippingDiscount"),
      companyName: text("Firma", "company.name", true, "Firma"),
      companyTaxNumber: text("Vergi no", "company.taxNumber", false, "Firma"),
      creditLimit: money("Kredi limiti", "company.creditLimit", "Firma"),
      currentBalance: money("Güncel bakiye", "company.currentBalance", "Firma"),
      companyPaymentTermDays: {
        label: "Firma vadesi (gün)",
        type: "number",
        path: "company.paymentTermDays",
        groupable: true,
        format: "number",
        source: "Firma",
      },
      customerGroupName: text("Müşteri grubu", "company.customerGroup.name", true, "Firma"),
      salesRepName: text("Plasiyer", "company.salesRep.name", true, "Firma"),
      salesRepEmail: text("Plasiyer e-posta", "company.salesRep.email", false, "Firma"),
      createdByName: text("Siparişi giren", "createdBy.name", true, "Kullanıcı"),
      carrier: text("Kargo firması", "carrier"),
      trackingNumber: text("Takip no", "trackingNumber", false),
      city: text("Sevk şehri", "shippingAddress.city", true, "Sevk adresi"),
      shippingDistrict: text("Sevk ilçesi", "shippingAddress.district", true, "Sevk adresi"),
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
    sql: {
      table: "OrderItem",
      alias: "oi",
      joins: [
        { prefix: "order", table: "Order", alias: "o", on: 'o."id" = oi."orderId"' },
        {
          prefix: "order.company",
          table: "Company",
          alias: "c",
          on: 'c."id" = o."companyId"',
        },
        {
          prefix: "order.company.customerGroup",
          table: "CustomerGroup",
          alias: "cg",
          on: 'cg."id" = c."customerGroupId"',
        },
        {
          prefix: "order.company.salesRep",
          table: "User",
          alias: "csr",
          on: 'csr."id" = c."salesRepId"',
        },
        {
          prefix: "variant",
          table: "ProductVariant",
          alias: "v",
          on: 'v."id" = oi."variantId"',
        },
        {
          prefix: "variant.product",
          table: "Product",
          alias: "p",
          on: 'p."id" = v."productId"',
        },
        {
          prefix: "variant.product.category",
          table: "Category",
          alias: "cat",
          on: 'cat."id" = p."categoryId"',
        },
      ],
    },
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
      promotionDiscount: money("Kampanya indirimi", "promotionDiscount"),
      // Part of "Birim iskonto" above, carried separately so a report can total
      // what the turnover ladder actually cost without re-deriving it.
      volumeDiscount: money("Birim hacim iskontosu", "volumeDiscount"),
      quantityShipped: {
        label: "Sevk edilen",
        type: "number",
        path: "quantityShipped",
        format: "number",
      },
      quantityInvoiced: {
        label: "Faturalanan",
        type: "number",
        path: "quantityInvoiced",
        format: "number",
      },
      isGift: { label: "Hediye", type: "boolean", path: "isGift", groupable: true },
      orderNumber: text("Sipariş no", "order.orderNumber", false, "Sipariş"),
      orderStatus: {
        label: "Sipariş durumu",
        type: "enum",
        path: "order.status",
        groupable: true,
        enumValues: ORDER_STATUSES,
        source: "Sipariş",
      },
      orderPaymentMethod: {
        label: "Ödeme yöntemi",
        type: "enum",
        path: "order.paymentMethod",
        groupable: true,
        enumValues: PAYMENT_METHODS,
        source: "Sipariş",
      },
      ...dateParts("order.createdAt", "Sipariş tarihi"),
      companyName: text("Firma", "order.company.name", true, "Firma"),
      customerGroupName: text(
        "Müşteri grubu",
        "order.company.customerGroup.name",
        true,
        "Firma",
      ),
      salesRepName: text("Plasiyer", "order.company.salesRep.name", true, "Firma"),
      sku_catalog: text("Katalog SKU", "variant.sku", false, "Ürün"),
      brand: text("Marka", "variant.product.brand", true, "Ürün"),
      productNameCatalog: text("Katalog adı", "variant.product.name", true, "Ürün"),
      categoryName: text("Kategori", "variant.product.category.name", true, "Ürün"),
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
    sql: {
      table: "Transaction",
      alias: "t",
      joins: [
        { prefix: "company", table: "Company", alias: "c", on: 'c."id" = t."companyId"' },
        {
          prefix: "company.customerGroup",
          table: "CustomerGroup",
          alias: "cg",
          on: 'cg."id" = c."customerGroupId"',
        },
        {
          prefix: "company.salesRep",
          table: "User",
          alias: "csr",
          on: 'csr."id" = c."salesRepId"',
        },
        {
          prefix: "recordedBy",
          table: "User",
          alias: "rb",
          on: 'rb."id" = t."recordedById"',
        },
        { prefix: "order", table: "Order", alias: "o", on: 'o."id" = t."orderId"' },
      ],
    },
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
      companyName: text("Firma", "company.name", true, "Firma"),
      customerGroupName: text("Müşteri grubu", "company.customerGroup.name", true, "Firma"),
      salesRepName: text("Plasiyer", "company.salesRep.name", true, "Firma"),
      currentBalance: money("Güncel bakiye", "company.currentBalance", "Firma"),
      recordedByName: text("Kaydeden", "recordedBy.name", true, "Kullanıcı"),
      orderNumber: text("Sipariş no", "order.orderNumber", false, "Sipariş"),
      orderStatus: {
        label: "Sipariş durumu",
        type: "enum",
        path: "order.status",
        groupable: true,
        enumValues: ORDER_STATUSES,
        source: "Sipariş",
      },
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
    sql: {
      table: "Company",
      alias: "c",
      joins: [
        {
          prefix: "customerGroup",
          table: "CustomerGroup",
          alias: "cg",
          on: 'cg."id" = c."customerGroupId"',
        },
        { prefix: "salesRep", table: "User", alias: "sr", on: 'sr."id" = c."salesRepId"' },
      ],
    },
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
      customerGroupName: text("Müşteri grubu", "customerGroup.name", true, "Müşteri grubu"),
      salesRepName: text("Plasiyer", "salesRep.name", true, "Plasiyer"),
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
    sql: {
      table: "CheckIn",
      alias: "ci",
      joins: [
        { prefix: "company", table: "Company", alias: "c", on: 'c."id" = ci."companyId"' },
        {
          prefix: "company.customerGroup",
          table: "CustomerGroup",
          alias: "cg",
          on: 'cg."id" = c."customerGroupId"',
        },
        { prefix: "salesRep", table: "User", alias: "sr", on: 'sr."id" = ci."salesRepId"' },
      ],
    },
    defaultSort: { field: "checkInAt", direction: "desc" },
    fields: {
      ...dateParts("checkInAt", "Ziyaret"),
      ...dateParts("checkOutAt", "Çıkış"),
      note: text("Not", "note", false),
      latitude: { label: "Enlem", type: "number", path: "latitude", format: "number" },
      longitude: { label: "Boylam", type: "number", path: "longitude", format: "number" },
      companyName: text("Firma", "company.name", true, "Firma"),
      customerGroupName: text("Müşteri grubu", "company.customerGroup.name", true, "Firma"),
      salesRepName: text("Plasiyer", "salesRep.name", true, "Plasiyer"),
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
      source: f.source ?? ds.label,
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
