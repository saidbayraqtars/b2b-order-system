import { z } from "zod";

// ─────────────────────────────────────────────
// BAYİ BAŞVURUSU
// ─────────────────────────────────────────────
//
// Toptan sistemde "kayıt ol" bir hesap açmaz, bir **başvuru** açar. Sebep
// ticari: burada açılan her müşteri bir cari, cariye kredi limiti ve vade
// tanımlanır, siparişi borç doğurur. Kendi kendine açılabilen bir cari,
// kimsenin onaylamadığı bir alacak demektir.
//
// Bu yüzden akış iki belgeye ayrılmış:
//   1. `DealerApplication` — ziyaretçinin doldurduğu form. Hiçbir yetkisi yok,
//      hiçbir ekranı açmaz, kimseye giriş vermez. Yalnızca bir talep kaydı.
//   2. Onaylandığında `Company` + `User` — asıl kayıtlar. Onları açan kişi
//      yönetimdeki bir insan, formu dolduran kişi değil.
//
// Reddedilen başvuru silinmiyor: "biz başvurmuştuk" tartışmasının tek cevabı o
// satır ve kararın notu.

export const DealerApplicationStatusEnum = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
]);
export type DealerApplicationStatus = z.infer<
  typeof DealerApplicationStatusEnum
>;

export const DEALER_APPLICATION_STATUS_LABELS: Record<
  DealerApplicationStatus,
  string
> = {
  PENDING: "Değerlendiriliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
};

const trimmed = (max: number) => z.string().trim().max(max);

/** Boş bırakılan alan `undefined` olur; `""` veritabanına yazılmaz. */
const optionalText = (max: number) =>
  trimmed(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

/**
 * Ziyaretçinin gönderdiği form.
 *
 * Alanlar bilerek az: bir başvuruyu değerlendirmek için gereken asgari bilgi
 * ne ise o. Kredi limiti, vade, müşteri grubu, fiyat listesi — hiçbiri burada
 * yok, çünkü onlar başvuranın söyleyeceği şeyler değil, onaylayanın karar
 * verdiği şeyler.
 */
export const dealerApplicationSchema = z.object({
  companyName: trimmed(200).min(2, "Firma ünvanı gerekli"),
  /** TR: 10 haneli vergi no ya da 11 haneli TC kimlik (şahıs şirketi). */
  taxNumber: trimmed(11)
    .regex(/^\d{10,11}$/, "Vergi/TC numarası 10 veya 11 hane olmalı")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  taxOffice: optionalText(120),
  city: trimmed(80).min(2, "İl gerekli"),
  district: optionalText(80),
  contactName: trimmed(120).min(2, "Yetkili adı gerekli"),
  email: trimmed(200).toLowerCase().pipe(z.string().email("Geçerli bir e-posta girin")),
  /**
   * Biçim dayatılmıyor, yalnızca uzunluk. "0532…", "+90 532…", "(0532)…"
   * hepsi aynı numara; birini reddetmek başvuruyu kaybettirir, numarayı
   * düzeltmez.
   */
  phone: trimmed(40).min(7, "Telefon gerekli"),
  /** "Hangi ürün grubuyla ilgileniyoruz", "kaç şubemiz var" gibi serbest not. */
  note: optionalText(1000),
  /**
   * Aydınlatma metni onayı. `literal(true)`: gönderilmemiş ya da `false`
   * gelmişse şema düşer — kutuyu işaretlemeden gönderilebilen bir form,
   * onayın hiç alınmadığı anlamına gelir.
   */
  consent: z.literal(true, {
    errorMap: () => ({ message: "Devam etmek için onay kutusunu işaretleyin" }),
  }),
});
export type DealerApplicationInput = z.infer<typeof dealerApplicationSchema>;

/**
 * Karar.
 *
 * Onayda kredi limiti ve vade **burada** giriliyor, başvuruda değil: yeni
 * müşterinin ne kadar borçlanabileceği satıcının kararı. İkisi de boş
 * bırakılabilir (0 limit / peşin), çünkü "önce görelim" en yaygın cevap.
 */
export const dealerApplicationDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("APPROVE"),
    creditLimit: z.coerce.number().min(0).max(99_999_999).default(0),
    paymentTermDays: z.coerce.number().int().min(0).max(365).default(0),
    /**
     * Onaylanan firmanın siparişleri firma yöneticisinin onayından geçsin mi.
     * Yeni müşteride varsayılan `false`: iki kişilik bir bayide iç onay
     * kurmak, ilk siparişi kimsenin serbest bırakamadığı bir kuyruğa sokar.
     */
    requiresOrderApproval: z.boolean().default(false),
    salesRepId: z
      .string()
      .cuid()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    customerGroupId: z
      .string()
      .cuid()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    note: optionalText(500),
  }),
  z.object({
    decision: z.literal("REJECT"),
    /**
     * Ret gerekçesi zorunlu. Serbest bırakılsaydı reddedilen başvuruların
     * yarısı gerekçesiz kalırdı ve altı ay sonra "bunu neden reddetmişiz"
     * sorusunun cevabı olmazdı.
     */
    note: trimmed(500).min(3, "Ret gerekçesi gerekli"),
  }),
]);
export type DealerApplicationDecisionInput = z.infer<
  typeof dealerApplicationDecisionSchema
>;

/** Yönetim listesinin okuduğu satır. */
export interface DealerApplicationView {
  id: string;
  companyName: string;
  taxNumber: string | null;
  taxOffice: string | null;
  city: string;
  district: string | null;
  contactName: string;
  email: string;
  phone: string;
  note: string | null;
  status: DealerApplicationStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  decidedBy: { id: string; name: string } | null;
  /** Onayda açılan kayıtlar — karardan sonra firmaya gitmenin yolu. */
  createdCompanyId: string | null;
  createdUserId: string | null;
  createdAt: string;
}
