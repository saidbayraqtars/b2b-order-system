import { z } from "zod";

// ERP köprüsünün sözleşmesi.
//
// The agent runs on the customer's machine, reads their ERP, and posts these
// shapes. They are normalised on purpose: nothing here is Vega-specific, so a
// second customer on a different ERP needs a different agent and **no change on
// this side**.
//
// Every payload is capped. The agent is trusted to be our software, but a
// trusted client with a bug can still send a 400 MB body, and an ingest that
// falls over on one is an ingest that stops the customer's stock updating.

export const ErpSyncKindEnum = z.enum(["CUSTOMERS", "STOCK", "PRICES", "BALANCES"]);
export type ErpSyncKind = z.infer<typeof ErpSyncKindEnum>;

export const ERP_SYNC_KIND_LABELS: Record<ErpSyncKind, string> = {
  CUSTOMERS: "Cari kartları",
  STOCK: "Stok",
  PRICES: "Fiyat listesi",
  BALANCES: "Cari bakiyeleri",
};

export const ERP_SYNC_STATUS_LABELS: Record<string, string> = {
  RUNNING: "Çalışıyor",
  SUCCEEDED: "Tamamlandı",
  PARTIAL: "Kısmen uygulandı",
  FAILED: "Başarısız",
};

/** One batch. The agent pages through large tables rather than sending one body. */
const MAX_ROWS = 5000;

const externalCode = z.string().trim().min(1, "Kod boş olamaz").max(60);

export const erpCustomerRowSchema = z.object({
  code: externalCode,
  name: z.string().trim().max(200).optional().nullable(),
  taxNumber: z.string().trim().max(20).optional().nullable(),
  taxOffice: z.string().trim().max(120).optional().nullable(),
  /** Cari bakiye as the ERP computes it. Stored beside ours, never over it. */
  balance: z.coerce.number().finite().optional().nullable(),
});

export const erpStockRowSchema = z.object({
  code: externalCode,
  /** Negative is clamped, not refused — the ERP's reason is the ERP's business. */
  quantity: z.coerce.number().finite(),
});

export const erpPriceRowSchema = z.object({
  code: externalCode,
  price: z.coerce.number().finite().min(0),
  /** Müşteri grubu adı; boş = varsayılan kademe. */
  customerGroupCode: z.string().trim().max(120).optional().nullable(),
  minQuantity: z.coerce.number().int().min(1).max(1_000_000).optional().nullable(),
});

export const erpCustomerBatchSchema = z.object({
  rows: z.array(erpCustomerRowSchema).max(MAX_ROWS),
});
export type ErpCustomerBatch = z.infer<typeof erpCustomerBatchSchema>;

export const erpStockBatchSchema = z.object({
  rows: z.array(erpStockRowSchema).max(MAX_ROWS),
});
export type ErpStockBatch = z.infer<typeof erpStockBatchSchema>;

export const erpPriceBatchSchema = z.object({
  rows: z.array(erpPriceRowSchema).max(MAX_ROWS),
});
export type ErpPriceBatch = z.infer<typeof erpPriceBatchSchema>;

// ─────────────────────────────────────────────
// YÖNETİM
// ─────────────────────────────────────────────

export const createErpAgentSchema = z.object({
  name: z.string().trim().min(1, "Ajan adı gerekli").max(80),
  /** Hangi ERP — yalnızca ekranda okunur, davranışı değiştirmez. */
  erp: z.string().trim().min(1).max(40).default("vega"),
});
export type CreateErpAgentInput = z.infer<typeof createErpAgentSchema>;

export const updateErpAgentSchema = z.object({
  isActive: z.boolean(),
});
export type UpdateErpAgentInput = z.infer<typeof updateErpAgentSchema>;
