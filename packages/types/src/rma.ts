import { z } from "zod";
import { entityIdSchema } from "./id";

// ─────────────────────────────────────────────
// İADE (RMA)
// ─────────────────────────────────────────────
//
// İptal ile iade karıştırılmaması gereken iki iş: iptal, mal çıkmadan
// siparişin hiç olmamış sayılmasıdır; iade, satış gerçekleştikten sonra malın
// geri gelmesidir. Birincisi siparişi geri alır, ikincisi üstüne yeni bir
// belge yazar. Ayrıntılı gerekçe schema.prisma'daki "İADE (RMA)" başlığında.
//
// Buradaki şemalar hem uçların girdi denetimi hem de ekranların tip kaynağı.

/**
 * Talebin nerede olduğu.
 *
 * Kritik ayrım `APPROVED` ile `RECEIVED` arasında: kabul etmek bir söz,
 * teslim almak bir olay. Stok ve cari yalnızca ikincisinde oynar — kabul
 * edildiği anda stok arttırılsaydı, yola çıkmamış (belki hiç çıkmayacak) mal
 * satılabilir görünürdü.
 */
export const ReturnStatusEnum = z.enum([
  "REQUESTED",
  "APPROVED",
  "RECEIVED",
  "REJECTED",
  "CANCELLED",
]);
export type ReturnStatus = z.infer<typeof ReturnStatusEnum>;

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: "Talep edildi",
  APPROVED: "Kabul edildi, mal bekleniyor",
  RECEIVED: "Teslim alındı",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal edildi",
};

/** Bu durumdan sonra talep hareket etmez. */
export const RETURN_TERMINAL_STATUSES: readonly ReturnStatus[] = [
  "RECEIVED",
  "REJECTED",
  "CANCELLED",
];

/**
 * Hangi durumdan hangisine geçilebilir.
 *
 * `REQUESTED → RECEIVED` yok: mal, kabul edilmeden teslim alınamaz. Kabul ile
 * teslim aynı dakikada olsa bile iki ayrı kayıt — "kim kabul etti" ile "kim
 * teslim aldı" çoğu kurulumda iki farklı kişi ve iade tartışması tam da bu
 * ikisinin arasında çıkıyor.
 */
export const RETURN_TRANSITIONS: Record<ReturnStatus, readonly ReturnStatus[]> = {
  REQUESTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["RECEIVED", "CANCELLED"],
  RECEIVED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canTransitionReturn(
  from: ReturnStatus,
  to: ReturnStatus,
): boolean {
  return RETURN_TRANSITIONS[from].includes(to);
}

/**
 * Geri gelen malın hâli.
 *
 * Para tarafını değiştirmiyor — müşteri malı iade ettiyse bedeli alacak
 * yazılır. Değiştirdiği tek şey stoka girip girmeyeceği, ve o karar depoya
 * bakan kişinin.
 */
export const ReturnConditionEnum = z.enum(["RESELLABLE", "DAMAGED"]);
export type ReturnCondition = z.infer<typeof ReturnConditionEnum>;

export const RETURN_CONDITION_LABELS: Record<ReturnCondition, string> = {
  RESELLABLE: "Sağlam — stoka girer",
  DAMAGED: "Hasarlı — stoka girmez",
};

// ─────────────────────────────────────────────
// GİRDİLER
// ─────────────────────────────────────────────

/**
 * Talep satırı.
 *
 * `condition` talep anında da sorulabiliyor ama bağlayıcı değil: alıcı "sağlam"
 * dese de malı gören teslim alma adımında düzeltebilir. Bağlayıcı olan, depoya
 * girerken yazılan hâl.
 */
export const returnItemInputSchema = z.object({
  orderItemId: entityIdSchema,
  quantity: z.number().int().min(1).max(1_000_000),
  condition: ReturnConditionEnum.optional(),
});
export type ReturnItemInput = z.infer<typeof returnItemInputSchema>;

export const createReturnSchema = z.object({
  orderId: entityIdSchema,
  /** Gerekçesiz iade talebi, karar verecek kişiye hiçbir şey söylemez. */
  reason: z.string().trim().min(3, "Gerekçe yazın").max(500),
  items: z.array(returnItemInputSchema).min(1, "En az bir satır seçin").max(200),
});
export type CreateReturnInput = z.infer<typeof createReturnSchema>;

/**
 * Satıcının kararı ve teslim alma.
 *
 * Tek uç, tek şema: durum geçişlerinin hepsi aynı kapıdan geçiyor ki
 * "hangi geçiş nerede yapılıyor" sorusunun tek cevabı olsun.
 *
 * `items` yalnızca `RECEIVED` adımında anlamlı ve orada da isteğe bağlı:
 * verilmezse talepte yazan adet ve hâl aynen kabul edilir, verilirse gelen mal
 * neyse o yazılır (üç koli istenmiş, ikisi gelmiş; sağlam denmiş, kırık
 * gelmiş). Talepte olmayan bir satır buradan eklenemez.
 */
export const receivedItemSchema = z.object({
  returnItemId: entityIdSchema,
  /** 0 = bu satır hiç gelmedi; satır düşürülür, iade tutarından çıkar. */
  quantity: z.number().int().min(0).max(1_000_000),
  condition: ReturnConditionEnum.optional(),
});
export type ReceivedItemInput = z.infer<typeof receivedItemSchema>;

export const returnActionSchema = z
  .object({
    status: ReturnStatusEnum,
    note: z.string().trim().max(500).optional(),
    items: z.array(receivedItemSchema).max(200).optional(),
  })
  .refine((v) => v.status !== "REJECTED" || (v.note ?? "").trim() !== "", {
    message: "Ret gerekçesini yazın",
    path: ["note"],
  })
  .refine((v) => v.status === "RECEIVED" || v.items === undefined, {
    message: "Satır düzeltmesi yalnızca teslim alırken yapılır",
    path: ["items"],
  });
export type ReturnActionInput = z.infer<typeof returnActionSchema>;

export const returnFilterSchema = z.object({
  status: ReturnStatusEnum.optional(),
  companyId: entityIdSchema.optional(),
  orderId: entityIdSchema.optional(),
  /** Açık talepler: karar ya da mal bekleyenler. */
  openOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});
export type ReturnFilterInput = z.infer<typeof returnFilterSchema>;

// ─────────────────────────────────────────────
// GÖRÜNÜMLER
// ─────────────────────────────────────────────
//
// Para alanları dize: Decimal'i JSON'a float olarak geçirmek, kuruşu bozan
// tek satırlık hata. Uygulamanın geri kalanında da böyle.

export interface ReturnLineView {
  id: string;
  orderItemId: string;
  variantId: string;
  productName: string;
  sku: string;
  quantity: number;
  condition: ReturnCondition;
  unitPrice: string;
  discount: string;
  promotionDiscount: string;
  vatRate: number;
  /** İki iskonto düşülmüş, KDV hariç. */
  lineTotal: string;
}

export interface ReturnView {
  id: string;
  rmaNumber: string;
  status: ReturnStatus;
  orderId: string;
  orderNumber: string;
  companyId: string;
  companyName: string;
  reason: string;
  decisionNote: string | null;
  /** KDV dahil iade tutarı; nakliye bedeli dahil değil. */
  refundTotal: string;
  currency: string;
  requestedByName: string;
  decidedByName: string | null;
  decidedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  /** Teslim alındığında yazılan cari alacak satırı, varsa. */
  creditTransactionId: string | null;
  items: ReturnLineView[];
}

/** Listede satır başına gösterilen özet — satırlar getirilmez. */
export type ReturnSummary = Omit<ReturnView, "items"> & { itemCount: number };

/**
 * Bir siparişin iade edilebilir satırları.
 *
 * `returnableQuantity`, sevk edilmiş adetten hâlâ geçerli taleplerdekiler
 * düşülerek bulunuyor: reddedilmiş ya da iptal edilmiş bir talep hakkı geri
 * verir, teslim alınmış olan vermez.
 */
export interface ReturnableLineView {
  orderItemId: string;
  variantId: string;
  productName: string;
  sku: string;
  quantityOrdered: number;
  quantityShipped: number;
  quantityReturned: number;
  returnableQuantity: number;
  unitPrice: string;
  discount: string;
  vatRate: number;
}
