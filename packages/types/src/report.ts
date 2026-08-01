import { z } from "zod";

// Query shapes for the statement / reporting endpoints. Dates arrive as
// query-string values, so they are parsed from ISO strings (yyyy-mm-dd is
// accepted too — Date handles both) rather than expected to be Date already.

const isoDate = z
  .string()
  .min(1)
  .refine((v) => !Number.isNaN(Date.parse(v)), "Geçersiz tarih");

/** from/to are inclusive; both optional (defaults are decided per report). */
export const dateRangeSchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine(
    (v) => !v.from || !v.to || Date.parse(v.from) <= Date.parse(v.to),
    "Başlangıç tarihi bitişten sonra olamaz",
  );
export type DateRangeInput = z.infer<typeof dateRangeSchema>;

export const statementQuerySchema = dateRangeSchema;

export const reportQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    companyId: z.string().cuid().optional(),
    salesRepId: z.string().cuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine(
    (v) => !v.from || !v.to || Date.parse(v.from) <= Date.parse(v.to),
    "Başlangıç tarihi bitişten sonra olamaz",
  );
export type ReportQueryInput = z.infer<typeof reportQuerySchema>;

/** Aging bucket boundaries in days past due. Last bucket is open-ended. */
export const AGING_BUCKETS = [30, 60, 90] as const;
export type AgingBucketKey = "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";

export const AGING_BUCKET_LABELS: Record<AgingBucketKey, string> = {
  current: "Vadesi gelmemiş",
  d1_30: "1-30 gün",
  d31_60: "31-60 gün",
  d61_90: "61-90 gün",
  d90_plus: "90+ gün",
};
