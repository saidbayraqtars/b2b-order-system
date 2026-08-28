import { z } from "zod";

/**
 * Resmî tatil kaydı (KALAN-ISLER §6.4).
 *
 * `date` **gün** ("YYYY-MM-DD"), zaman damgası değil: saat taşıyan bir değer
 * saat dilimi kaydırmasıyla komşu güne düşer ve iş günü sayacı yanlış günü
 * düşerdi.
 *
 * `halfDay` arife için: yarım gün 0,5 iş günü sayılıyor. Ayrı bir bayrak,
 * çünkü "yarım gün" bir tarih listesinden çıkarılamaz.
 */
export const saveHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Gün YYYY-AA-GG olmalı"),
  name: z.string().trim().min(2, "Tatil adı gerekli").max(120),
  halfDay: z.boolean().default(false),
});
export type SaveHolidayInput = z.infer<typeof saveHolidaySchema>;
