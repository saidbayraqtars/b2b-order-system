import { z } from "zod";
import {
  TargetMetricEnum,
  TargetPeriodEnum,
  VisitRequestStatusEnum,
} from "./enums";

// Saha operasyonu: hedefler, ziyaret çağrıları, teslimat.
// Şemalar hem uçların girdi doğrulaması hem de formların tip kaynağı.

/** Tarayıcıdan gelen "2026-08-07" biçimindeki gün. */
const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih GG biçiminde olmalı (YYYY-AA-GG)");

export const salesTargetSchema = z.object({
  salesRepId: z.string().cuid(),
  metric: TargetMetricEnum,
  period: TargetPeriodEnum,
  /** Dönem içindeki herhangi bir gün; sunucu dönemin başına yuvarlar. */
  periodStart: dayString,
  /**
   * Ziyarette adet, ciroda tutar. Metin olarak taşınıyor çünkü ciro hedefi
   * kuruşlu olabiliyor ve JavaScript sayısı üzerinden geçirmek yuvarlama
   * hatası bırakıyor.
   */
  targetValue: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Geçerli bir değer girin")
    .or(z.number().nonnegative().transform((n) => n.toString())),
  note: z.string().trim().max(300).optional().nullable(),
});
export type SalesTargetInputDto = z.infer<typeof salesTargetSchema>;

export const createVisitRequestSchema = z.object({
  /** Yalnızca vekil kullanıcı gönderir; bayi kendi firması adına açar. */
  companyId: z.string().cuid().optional(),
  requestedFor: dayString.optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});
export type CreateVisitRequestInput = z.infer<typeof createVisitRequestSchema>;

export const updateVisitRequestSchema = z
  .object({
    status: VisitRequestStatusEnum.optional(),
    requestedFor: dayString.nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Güncellenecek alan yok");
export type UpdateVisitRequestInput = z.infer<typeof updateVisitRequestSchema>;

/**
 * Ziyaret listesinin elle sırası.
 *
 * Tek tek "yukarı/aşağı" isteği yerine listenin tamamı gönderiliyor: iki
 * satırın yerini değiştirmek iki ayrı yazma olsaydı, araya giren başka bir
 * değişiklikte sıra bozulur ve kimse nedenini bulamazdı.
 */
export const reorderVisitsSchema = z.object({
  /** İstenen sıradaki çağrı kimlikleri. Listede olmayanlar sona düşer. */
  ids: z.array(z.string().cuid()).max(200),
});
export type ReorderVisitsInput = z.infer<typeof reorderVisitsSchema>;

/** Adresin haritadaki noktası. */
export const addressGeoSchema = z.object({
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
});
export type AddressGeoInput = z.infer<typeof addressGeoSchema>;

export const confirmDeliverySchema = z.object({
  /** Kâğıdı imzalayan kişinin adı. */
  receivedByName: z.string().trim().min(2).max(120),
  /** İmzalı belgenin fotoğrafı — yüklenen medyanın yolu. */
  proofPhotoUrl: z.string().trim().max(500).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});
export type ConfirmDeliveryInput = z.infer<typeof confirmDeliverySchema>;

export const assignCourierSchema = z.object({
  /** Null = atamayı kaldır. */
  courierId: z.string().cuid().nullable(),
});
export type AssignCourierInput = z.infer<typeof assignCourierSchema>;
