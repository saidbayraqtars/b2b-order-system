import { z } from "zod";

// Özel kodlar — ürüne ve firmaya verilen serbest sınıflandırma alanları.
//
// Vega'nın `KOD1..KOD21` + etiket tablosu desenini (kılavuz §64) sadeleştirir:
// her varlıkta 10 yuva, her yuvanın adı ve isteğe bağlı seçenek listesi
// kurulumda ekrandan verilir. Değer düz kolonda durur (`code1..code10`), çünkü
// süzgeç, rapor ve indeks JSON'la değil kolonla çalışıyor.
//
// Kılavuzun uyarısı burada da geçerli: **etiket içerik değildir.** Etiketi
// "Marka" olan bir yuvada marka olduğu varsayılmaz; kural, rapor ve süzgeç her
// zaman yuva numarasıyla konuşur, etiket yalnızca ekranda okunur.

export const CUSTOM_CODE_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type CustomCodeSlot = (typeof CUSTOM_CODE_SLOTS)[number];

export const CustomCodeEntityEnum = z.enum(["PRODUCT", "COMPANY"]);
export type CustomCodeEntity = z.infer<typeof CustomCodeEntityEnum>;

export const CUSTOM_CODE_ENTITY_LABELS: Record<CustomCodeEntity, string> = {
  PRODUCT: "Ürün",
  COMPANY: "Firma",
};

/** `code1`…`code10` — veritabanı kolonunun ve API alanının adı. */
export type CustomCodeKey = `code${CustomCodeSlot}`;

export const CUSTOM_CODE_KEYS = CUSTOM_CODE_SLOTS.map(
  (s) => `code${s}` as CustomCodeKey,
) as readonly CustomCodeKey[];

export function customCodeKey(slot: CustomCodeSlot): CustomCodeKey {
  return `code${slot}`;
}

/** Bir değer en fazla bu kadar karakter; kolon `VARCHAR(100)`. */
export const CUSTOM_CODE_MAX = 100;

/** Bir yuvanın seçenek listesi en fazla bu kadar satır. */
export const CUSTOM_CODE_MAX_OPTIONS = 200;

export const customCodeSlotSchema = z.coerce
  .number()
  .int()
  .refine(
    (n): n is CustomCodeSlot => (CUSTOM_CODE_SLOTS as readonly number[]).includes(n),
    "Yuva 1 ile 10 arasında olmalı",
  )
  .transform((n) => n as CustomCodeSlot);

/**
 * Bir yuvanın tanımı.
 *
 * Seçenekler kırpılıyor, boşlar atılıyor ve tekilleştiriliyor; büyük/küçük harf
 * farkı **ayrı seçenek sayılmıyor** ("Bayi" ile "BAYİ" iki ayrı segment olsaydı
 * kural yazan kişi hangisini seçeceğini bilemezdi).
 */
export const saveCustomCodeFieldSchema = z.object({
  label: z.string().trim().min(1, "Alan adı gerekli").max(60),
  isActive: z.boolean().default(true),
  options: z
    .array(z.string().trim().max(CUSTOM_CODE_MAX))
    .max(CUSTOM_CODE_MAX_OPTIONS, `En fazla ${CUSTOM_CODE_MAX_OPTIONS} seçenek`)
    .default([])
    .transform((list) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of list) {
        if (!raw) continue;
        const key = raw.toLocaleUpperCase("tr");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(raw);
      }
      return out;
    }),
  showInCatalogFilter: z.boolean().default(false),
});
export type SaveCustomCodeFieldInput = z.infer<typeof saveCustomCodeFieldSchema>;

/** Tek bir kod değeri: boş metin "değer yok" demek ve null'a iner. */
const codeValue = z
  .string()
  .trim()
  .max(CUSTOM_CODE_MAX, `Özel kod en fazla ${CUSTOM_CODE_MAX} karakter`)
  .nullish()
  .transform((v) => (v ? v : null));

/**
 * Ürün/firma formlarının özel kod alanları.
 *
 * Her anahtar isteğe bağlı: gönderilmeyen yuva **değişmez**, `null` ya da boş
 * metin gönderilen yuva temizlenir. Seçenek listesine uygunluk burada değil
 * serviste denetleniyor — liste veritabanında duruyor.
 */
export const customCodeValuesSchema = z.object(
  Object.fromEntries(CUSTOM_CODE_KEYS.map((k) => [k, codeValue.optional()])) as Record<
    CustomCodeKey,
    z.ZodOptional<typeof codeValue>
  >,
);
export type CustomCodeValuesInput = z.infer<typeof customCodeValuesSchema>;

/** Ekrana giden kod değerleri: her yuva var, boşsa null. */
export type CustomCodeValues = Record<CustomCodeKey, string | null>;

/** Ekrana giden tanım. Tanımlanmamış yuva da listelenir (`defined: false`). */
export interface CustomCodeFieldView {
  entity: CustomCodeEntity;
  slot: CustomCodeSlot;
  key: CustomCodeKey;
  /** Tanım yoksa "Özel kod N". */
  label: string;
  /** Kurulumda bir ad verilmiş mi. */
  defined: boolean;
  isActive: boolean;
  options: string[];
  showInCatalogFilter: boolean;
}

/**
 * Liste ekranlarının süzgeci: `?kod3=BAYİ` biçiminde gelir.
 *
 * Adresteki anahtar `kod{N}`, çünkü süzgeç adreste durur
 * (`docs/hafiza/b2b-redesign.md`) ve adres Türkçe okunuyor.
 */
export function customCodeFiltersFrom(
  params: URLSearchParams,
): Partial<Record<CustomCodeKey, string>> {
  const out: Partial<Record<CustomCodeKey, string>> = {};
  for (const slot of CUSTOM_CODE_SLOTS) {
    const value = params.get(`kod${slot}`)?.trim();
    if (value) out[customCodeKey(slot)] = value.slice(0, CUSTOM_CODE_MAX);
  }
  return out;
}
