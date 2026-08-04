import { z } from "zod";

// Documents: numbering serials, despatches (irsaliye) and invoices (fatura).

export const DocumentTypeEnum = z.enum(["WAYBILL", "INVOICE"]);
export type DocumentType = z.infer<typeof DocumentTypeEnum>;

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  WAYBILL: "İrsaliye",
  INVOICE: "Fatura",
};

export const InvoiceStatusEnum = z.enum(["ISSUED", "CANCELLED"]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>;

/** A number the ERP produced. Never generated here, only accepted. */
const externalNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[A-Za-z0-9./-]+$/, "Belge numarası harf, rakam, nokta, tire, eğik çizgi içerebilir");

export const createDocumentSeriesSchema = z.object({
  type: DocumentTypeEnum,
  prefix: z
    .string()
    .trim()
    .min(1, "Ön ek gerekli")
    .max(10)
    .regex(/^[A-Za-z0-9-]+$/, "Ön ek harf, rakam ve tire içerebilir"),
  padding: z.number().int().min(1).max(12).optional(),
  /** Continue an existing serial from this number. */
  startFrom: z.number().int().min(0).max(99_999_999).optional(),
  isDefault: z.boolean().optional(),
  externalOnly: z.boolean().optional(),
  note: z.string().max(200).optional(),
});
export type CreateDocumentSeriesInput = z.infer<typeof createDocumentSeriesSchema>;

export const updateDocumentSeriesSchema = z
  .object({
    padding: z.number().int().min(1).max(12).optional(),
    startFrom: z.number().int().min(0).max(99_999_999).optional(),
    isDefault: z.boolean().optional(),
    externalOnly: z.boolean().optional(),
    note: z.string().max(200).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Güncellenecek alan yok");
export type UpdateDocumentSeriesInput = z.infer<typeof updateDocumentSeriesSchema>;

export const createShipmentSchema = z.object({
  items: z
    .array(
      z.object({
        orderItemId: z.string().cuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "Sevk edilecek kalem seçin"),
  carrier: z.string().max(120).optional(),
  trackingNumber: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
  shippedAt: z.string().datetime().optional(),
  externalNumber: externalNumberSchema.optional(),
});
export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;

export const createInvoiceSchema = z.object({
  /** Bill these despatches. Omitted = bill everything not yet invoiced. */
  shipmentIds: z.array(z.string().cuid()).max(50).optional(),
  issuedAt: z.string().datetime().optional(),
  /** Overrides the term-derived due date. */
  dueDate: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
  externalNumber: externalNumberSchema.optional(),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
