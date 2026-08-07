import { z } from "zod";

// ─────────────────────────────────────────────
// ÇEK / SENET PORTFÖYÜ
// ─────────────────────────────────────────────
//
// Adım 27'de kasa defteri açıldığında ortaya çıkan boşluk: çekle yapılan
// tahsilat cariyi kapatıyor ama kasaya girmiyor (doğrusu bu — kâğıt henüz para
// değil), ne var ki **kâğıdın kendisi hiçbir yerde durmuyordu**. Vadesi ne
// zaman, hangi bankanın, tahsil edildi mi, karşılıksız mı çıktı, ciro edildi
// mi — hiçbiri kayıtlı değildi. Toptan işinde portföyün yarısı çekse, bu
// defterin olmaması sistemin yarısının kör olması demek.
//
// Kayıt **tahsilattan doğar**, elle açılmaz: kâğıt karşılığı olmayan bir çek
// satırı ile cariyi kapatmayan bir çek, ikisi de defterle gerçeği ayrıştırır.

/**
 * Çek mi senet mi.
 *
 * `CollectionMethod` içinde ikisi zaten var; burada ayrı bir enum olmasının
 * sebebi portföyün yalnızca bu iki yöntemle ilgilenmesi — "nakit çek" diye bir
 * satır tipe göre imkânsız olmalı.
 */
export const ChequeKindEnum = z.enum(["CHEQUE", "PROMISSORY_NOTE"]);
export type ChequeKind = z.infer<typeof ChequeKindEnum>;

export const CHEQUE_KIND_LABELS: Record<ChequeKind, string> = {
  CHEQUE: "Çek",
  PROMISSORY_NOTE: "Senet",
};

/**
 * Kâğıdın hayatı.
 *
 * `CANCELLED` diğerlerinden farklı: bir durum değişikliğiyle değil, altındaki
 * tahsilatın iptal edilmesiyle oluşuyor.
 */
export const ChequeStatusEnum = z.enum([
  /** Elimizde, vadesini bekliyor. */
  "PORTFOLIO",
  /** Tahsile verildi — bankada, sonucu beklenen. */
  "DEPOSITED",
  /** Tahsil edildi. Para **bu adımda** kasaya girer. */
  "CLEARED",
  /** Karşılıksız. Kapanan borç geri açılır. */
  "BOUNCED",
  /** Ciro edildi — başkasına ödeme olarak verildi. Kasaya para girmez. */
  "ENDORSED",
  /** Müşteriye iade edildi. Borç geri açılır. */
  "RETURNED",
  /** Altındaki tahsilat iptal edildiği için düşen kayıt. */
  "CANCELLED",
]);
export type ChequeStatus = z.infer<typeof ChequeStatusEnum>;

export const CHEQUE_STATUS_LABELS: Record<ChequeStatus, string> = {
  PORTFOLIO: "Portföyde",
  DEPOSITED: "Tahsilde",
  CLEARED: "Tahsil edildi",
  BOUNCED: "Karşılıksız",
  ENDORSED: "Ciro edildi",
  RETURNED: "İade edildi",
  CANCELLED: "İptal",
};

/** Bu durumdan sonra kâğıt hareket etmez. */
export const CHEQUE_TERMINAL_STATUSES: readonly ChequeStatus[] = [
  "CLEARED",
  "BOUNCED",
  "ENDORSED",
  "RETURNED",
  "CANCELLED",
];

/**
 * Hangi durumdan hangisine geçilebilir.
 *
 * `PORTFOLIO → BOUNCED` de açık: senet bankaya verilmeden de ödenmeyebiliyor,
 * ve elden takip edilen çekte "tahsile verildi" adımı hiç yaşanmıyor.
 * `DEPOSITED → PORTFOLIO` geri çekmek için — banka kâğıdı iade ediyor ve kâğıt
 * yeniden elimizde oluyor.
 */
export const CHEQUE_TRANSITIONS: Record<ChequeStatus, readonly ChequeStatus[]> = {
  PORTFOLIO: ["DEPOSITED", "CLEARED", "BOUNCED", "ENDORSED", "RETURNED"],
  DEPOSITED: ["CLEARED", "BOUNCED", "PORTFOLIO"],
  CLEARED: [],
  BOUNCED: [],
  ENDORSED: [],
  RETURNED: [],
  CANCELLED: [],
};

export function canTransition(from: ChequeStatus, to: ChequeStatus): boolean {
  return CHEQUE_TRANSITIONS[from].includes(to);
}

/**
 * Kâğıdın künyesi.
 *
 * Hiçbiri zorunlu değil, `dueDate` bile. Sebep sahada: plasiyer çeki alırken
 * telefonda yalnızca tutarı giriyor, banka/seri/keşideci bilgisi ofiste
 * tamamlanıyor. Zorunlu alan koymak, tahsilatın hiç girilmemesine ya da
 * uydurma seri numarası yazılmasına yol açardı. Vadesi girilmemiş kâğıt
 * ekranda **eksik** işaretiyle duruyor.
 */
export const chequeDetailsSchema = z.object({
  kind: ChequeKindEnum.optional(),
  serialNumber: z.string().max(50).optional(),
  bankName: z.string().max(120).optional(),
  branchName: z.string().max(120).optional(),
  /** Keşideci — kâğıdı imzalayan. Müşterinin kendi çeki olmak zorunda değil. */
  drawerName: z.string().max(160).optional(),
  dueDate: z.coerce.date().optional(),
  notes: z.string().max(500).optional(),
});
export type ChequeDetailsInput = z.infer<typeof chequeDetailsSchema>;

/** Künye düzeltme — tahsilat sonrası ofiste tamamlanan bilgi. */
export const updateChequeSchema = chequeDetailsSchema;

/**
 * Durum değişikliği.
 *
 * `cashAccountId` yalnızca tahsil adımında anlamlı: para o an gerçekten bir
 * hesaba giriyor ve hangisi olduğu sorulmadan defter yazılamaz.
 * `endorsedTo` serbest metin — ciro edilen taraf çoğu zaman bizim sistemimizde
 * kayıtlı bir firma değil, tedarikçi.
 */
export const chequeActionSchema = z
  .object({
    status: ChequeStatusEnum,
    cashAccountId: z.string().cuid().nullable().optional(),
    endorsedTo: z.string().max(160).optional(),
    note: z.string().max(300).optional(),
    /** Gerçekleşme anı — dün tahsil edilen çek bugün girilebilir. */
    occurredAt: z.coerce.date().optional(),
  })
  .refine((v) => v.status !== "ENDORSED" || (v.endorsedTo ?? "").trim() !== "", {
    message: "Ciro edilen tarafı yazın",
    path: ["endorsedTo"],
  });
export type ChequeActionInput = z.infer<typeof chequeActionSchema>;

export const chequeFilterSchema = z.object({
  status: ChequeStatusEnum.optional(),
  kind: ChequeKindEnum.optional(),
  companyId: z.string().cuid().optional(),
  dueFrom: z.coerce.date().optional(),
  dueTo: z.coerce.date().optional(),
  /** Vadesi geçmiş ve hâlâ portföyde/tahsilde olanlar. */
  overdueOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});
export type ChequeFilterInput = z.infer<typeof chequeFilterSchema>;
