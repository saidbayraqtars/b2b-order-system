import { z } from "zod";

// Vitrin duyurusu. Promotion (fiyatı değiştiren kural) ile bilerek ayrı tutuldu:
// bu yalnızca gösterimdir, hiçbir tutarı etkilemez. Bir kampanyayı duyurmak için
// kullanılabilir ama "yılbaşında kapalıyız" da bir duyurudur.

export const AnnouncementPlacementEnum = z.enum(["TICKER", "BANNER", "MODAL"]);
export type AnnouncementPlacement = z.infer<typeof AnnouncementPlacementEnum>;

export const ANNOUNCEMENT_PLACEMENT_LABELS: Record<AnnouncementPlacement, string> = {
  TICKER: "Kayan şerit",
  BANNER: "Katalog üstü bant",
  MODAL: "Açılış penceresi",
};

/** Badge bileşeniyle aynı ton sözlüğü — arayüz tek renk dili konuşsun. */
export const AnnouncementToneEnum = z.enum([
  "brand",
  "neutral",
  "success",
  "warning",
  "danger",
  "info",
]);
export type AnnouncementTone = z.infer<typeof AnnouncementToneEnum>;

export const ANNOUNCEMENT_TONE_LABELS: Record<AnnouncementTone, string> = {
  brand: "Marka",
  neutral: "Nötr",
  success: "Olumlu",
  warning: "Uyarı",
  danger: "Kritik",
  info: "Bilgi",
};

const announcementBodySchema = z.object({
  title: z.string().trim().min(1, "Başlık gerekli").max(160),
  body: z.string().trim().max(600).nullable().optional(),
  linkUrl: z.string().trim().max(500).nullable().optional(),
  linkLabel: z.string().trim().max(60).nullable().optional(),
  placement: AnnouncementPlacementEnum.optional(),
  tone: AnnouncementToneEnum.optional(),
  dismissible: z.boolean().optional(),
  enabled: z.boolean().optional(),
  /** Büyük önce gösterilir. */
  priority: z.number().int().min(0).max(1000).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  /** Boş dizi = herkese. Doluysa yalnızca bu müşteri gruplarına. */
  customerGroupIds: z.array(z.string().min(1)).max(50).optional(),
});

const endsAfterStart = (v: {
  startsAt?: string | null;
  endsAt?: string | null;
}) => !v.startsAt || !v.endsAt || new Date(v.startsAt) < new Date(v.endsAt);

export const createAnnouncementSchema = announcementBodySchema.refine(
  endsAfterStart,
  { message: "Bitiş tarihi başlangıçtan sonra olmalı", path: ["endsAt"] },
);
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = announcementBodySchema
  .partial()
  .refine(endsAfterStart, {
    message: "Bitiş tarihi başlangıçtan sonra olmalı",
    path: ["endsAt"],
  });
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
