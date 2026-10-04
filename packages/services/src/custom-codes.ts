import { prisma, type Prisma } from "@repo/database";
import {
  CUSTOM_CODE_KEYS,
  CUSTOM_CODE_SLOTS,
  customCodeKey,
  type CustomCodeEntity,
  type CustomCodeFieldView,
  type CustomCodeKey,
  type CustomCodeSlot,
  type CustomCodeValues,
  type CustomCodeValuesInput,
  type SaveCustomCodeFieldInput,
} from "@repo/types";
import { BusinessError } from "./errors";
import { CODE_FIELD_PATTERN, describeDatasets } from "./report-registry";

// Özel kodlar — ürüne ve firmaya 10'ar sınıflandırma alanı.
//
// Üç karar:
//
//  1. **Değer düz kolonda, tanım ayrı tabloda.** `Product.code3` bir sütun;
//     "3. yuvanın adı Bölge, seçenekleri Ege/Marmara" bilgisi `CustomCodeField`
//     satırında. Rapor motoru, katalog süzgeci ve indeks kolonla çalışıyor —
//     JSON'da duran bir değer üçünü de zorlaştırırdı.
//  2. **Seçenek listesi yazarken denetleniyor, okurken değil.** Liste sonradan
//     daraltılabilir; o zaman eski değerler silinmiyor, tanım ekranı kaç satırın
//     listede olmadığını sayıyla söylüyor. Veriyi kural değişti diye sessizce
//     değiştirmek, kimsenin istemediği bir toplu güncelleme olurdu.
//  3. **Etiket içerik değildir** (kılavuz §64). Kural, rapor ve süzgeç her yerde
//     yuva numarasıyla konuşuyor; etiket yalnızca ekranda okunuyor. Etiketi
//     değiştirmek hiçbir kuralı, raporu ya da kaydedilmiş süzgeci bozmaz.

type Client = Prisma.TransactionClient | typeof prisma;

function defaultLabel(slot: CustomCodeSlot): string {
  return `Özel kod ${slot}`;
}

/**
 * Bir varlığın 10 yuvası, tanımlı olsun olmasın.
 *
 * Tanımlanmamış yuva da dönüyor (`defined: false`, pasif): tanım ekranı on
 * satırı birden gösteriyor ve hangilerinin boş olduğunu orada görmek gerekiyor.
 */
export async function listCustomCodeFields(
  entity: CustomCodeEntity,
  db: Client = prisma,
): Promise<CustomCodeFieldView[]> {
  const rows = await db.customCodeField.findMany({ where: { entity } });
  const bySlot = new Map(rows.map((r) => [r.slot, r]));

  return CUSTOM_CODE_SLOTS.map((slot) => {
    const row = bySlot.get(slot);
    return {
      entity,
      slot,
      key: customCodeKey(slot),
      label: row?.label ?? defaultLabel(slot),
      defined: Boolean(row),
      isActive: row?.isActive ?? false,
      options: row?.options ?? [],
      showInCatalogFilter: entity === "PRODUCT" && (row?.showInCatalogFilter ?? false),
    };
  });
}

/** Yalnızca kullanımda olan yuvalar — formlar ve süzgeçler bunları gösterir. */
export async function listActiveCustomCodeFields(
  entity: CustomCodeEntity,
  db: Client = prisma,
): Promise<CustomCodeFieldView[]> {
  return (await listCustomCodeFields(entity, db)).filter((f) => f.isActive);
}

export interface SaveCustomCodeFieldResult {
  field: CustomCodeFieldView;
  /**
   * Seçenek listesinde olmayan değer taşıyan satır sayısı.
   *
   * Liste daraltıldığında eski değerler yerinde kalıyor (yukarıdaki karar 2);
   * ekran bu sayıyı gösterip kullanıcıya hangi kayıtların düzeltilmesi
   * gerektiğini söylüyor.
   */
  outsideOptions: number;
}

export async function saveCustomCodeField(
  entity: CustomCodeEntity,
  slot: CustomCodeSlot,
  input: SaveCustomCodeFieldInput,
): Promise<SaveCustomCodeFieldResult> {
  const data = {
    label: input.label,
    isActive: input.isActive,
    options: input.options,
    // Firma alanı katalog süzgecinde gösterilmez: alıcı başka firmaları görmez.
    showInCatalogFilter: entity === "PRODUCT" ? input.showInCatalogFilter : false,
  };
  await prisma.customCodeField.upsert({
    where: { entity_slot: { entity, slot } },
    create: { entity, slot, ...data },
    update: data,
  });

  const field = (await listCustomCodeFields(entity)).find((f) => f.slot === slot)!;
  return { field, outsideOptions: await countOutsideOptions(entity, slot, input.options) };
}

async function countOutsideOptions(
  entity: CustomCodeEntity,
  slot: CustomCodeSlot,
  options: string[],
): Promise<number> {
  if (options.length === 0) return 0;
  const key = customCodeKey(slot);
  // Karşılaştırma büyük/küçük harf duyarsız: yazarken de öyle eşleniyor.
  const where = {
    AND: [
      { [key]: { not: null } },
      ...options.flatMap((o) =>
        trSpellings(o).map((v) => ({ NOT: { [key]: { equals: v, mode: "insensitive" } } })),
      ),
    ],
  };
  return entity === "PRODUCT"
    ? prisma.product.count({ where: where as Prisma.ProductWhereInput })
    : prisma.company.count({ where: where as Prisma.CompanyWhereInput });
}

/**
 * Formdan gelen kod değerlerini yazılacak veriye çevirir.
 *
 * - Gönderilmeyen yuva **değişmez** (dönen nesnede anahtarı yok).
 * - Boş metin ya da null yuvayı temizler.
 * - Yuvanın seçenek listesi varsa değer listeden biri olmak zorunda; eşleşme
 *   büyük/küçük harf duyarsız ve yazılan değer **listedeki yazımıdır**. "bayi"
 *   yazan kullanıcı "BAYİ" segmentine düşer, yeni bir segment açmaz.
 * - Pasif ya da tanımsız yuvaya yazmak serbest: Excel içe aktarma bütün
 *   sütunları taşır ve kapalı bir yuva yeniden açıldığında veri yerinde olmalı.
 */
export async function normalizeCustomCodes(
  entity: CustomCodeEntity,
  input: CustomCodeValuesInput,
  db: Client = prisma,
): Promise<Partial<CustomCodeValues>> {
  const provided = CUSTOM_CODE_KEYS.filter((k) => input[k] !== undefined);
  if (provided.length === 0) return {};

  const fields = await listCustomCodeFields(entity, db);
  const out: Partial<CustomCodeValues> = {};

  for (const key of provided) {
    // Şemadan geçmeden gelen çağrı (Excel aktarımı) boş metin taşıyabilir:
    // "" ve yalnız boşluk da "değer yok" demek.
    const raw = input[key];
    const value = typeof raw === "string" ? raw.trim() || null : (raw ?? null);
    if (value === null) {
      out[key] = null;
      continue;
    }
    const field = fields.find((f) => f.key === key)!;
    if (field.options.length === 0) {
      out[key] = value;
      continue;
    }
    const wanted = value.toLocaleUpperCase("tr");
    const match = field.options.find((o) => o.toLocaleUpperCase("tr") === wanted);
    if (!match) {
      throw new BusinessError(
        "INVALID_CUSTOM_CODE",
        `"${field.label}" alanı için "${value}" listede yok. ` +
          `Seçenekler: ${field.options.slice(0, 10).join(", ")}` +
          (field.options.length > 10 ? ` (+${field.options.length - 10})` : ""),
        { key, value },
      );
    }
    out[key] = match;
  }
  return out;
}

/** Satırdaki `code1..code10`u ekrana giden nesneye toplar. */
export function customCodeValuesOf(
  row: Partial<Record<CustomCodeKey, string | null>>,
): CustomCodeValues {
  return Object.fromEntries(
    CUSTOM_CODE_KEYS.map((k) => [k, row[k] ?? null]),
  ) as CustomCodeValues;
}

/** Prisma `select` parçası: on kolonun hepsi. */
export const CUSTOM_CODE_SELECT = Object.fromEntries(
  CUSTOM_CODE_KEYS.map((k) => [k, true]),
) as Record<CustomCodeKey, true>;

/**
 * Bir değerin Türkçe yazım biçimleri: kendisi, büyük ve küçük hâli.
 *
 * Postgres'in harf duyarsız karşılaştırması Türkçe İ/ı'yı bilmiyor:
 * `LOWER('BAYİ')` "bayi" değil, ne C yerelinde ne en_US'te. JS'in
 * `toLocaleUpperCase("tr")` biliyor — "bayi" → "BAYİ". Üç biçimi birden
 * denemek, liste ve serbest metin yuvalarında aynı segmentin iki yazımını
 * eşliyor; kalan karışık yazımları (`Bayİ`) zaten harf duyarsız eşleşme
 * yakalıyor.
 */
function trSpellings(value: string): string[] {
  return [...new Set([value, value.toLocaleUpperCase("tr"), value.toLocaleLowerCase("tr")])];
}

/**
 * Liste süzgeci → Prisma koşulu. Eşleşme büyük/küçük harf duyarsız ve tam:
 * "Ege" süzgeci "Ege Bölgesi"ni getirmez — segment adı bir kimliktir, arama
 * metni değil.
 */
export function customCodeWhere(
  filters: Partial<Record<CustomCodeKey, string>> | undefined,
): Array<{ OR: Array<Record<string, { equals: string; mode: "insensitive" }>> }> {
  if (!filters) return [];
  return CUSTOM_CODE_KEYS.filter((k) => filters[k]).map((k) => ({
    OR: trSpellings(filters[k]!).map((v) => ({
      [k]: { equals: v, mode: "insensitive" as const },
    })),
  }));
}

export interface CatalogCodeFilter {
  key: CustomCodeKey;
  label: string;
  /** Seçenek listesi; yoksa aktif ürünlerde geçen değerler (en çok 100). */
  values: string[];
}

/**
 * Portal kataloğunun özel kod süzgeçleri.
 *
 * Yalnızca "katalogda süzgeç olarak göster" işaretli aktif ürün yuvaları.
 * Seçenek listesi tanımlı değilse, aktif ürünlerde gerçekten geçen değerler
 * gösteriliyor — boş bir seçeneğe tıklayıp sıfır ürün görmek süzgeci
 * kullanılmaz yapar.
 */
export async function listCatalogCodeFilters(): Promise<CatalogCodeFilter[]> {
  const fields = (await listActiveCustomCodeFields("PRODUCT")).filter(
    (f) => f.showInCatalogFilter,
  );
  const out: CatalogCodeFilter[] = [];
  for (const f of fields) {
    if (f.options.length > 0) {
      out.push({ key: f.key, label: f.label, values: f.options });
      continue;
    }
    const rows = await prisma.product.findMany({
      where: { isActive: true, [f.key]: { not: null } },
      select: { [f.key]: true },
      distinct: [f.key],
      orderBy: { [f.key]: "asc" },
      take: 100,
    } as Prisma.ProductFindManyArgs);
    const values = rows
      .map((r) => (r as Record<string, unknown>)[f.key])
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (values.length > 0) out.push({ key: f.key, label: f.label, values });
  }
  return out;
}

/**
 * Rapor tasarımcısının alan listesi, özel kod adları kurulumdan okunmuş hâlde.
 *
 * Kullanılmayan yuva listeden düşüyor: on boş "Firma özel kod N" satırı alan
 * seçicisini okunmaz yapardı. Kayıtlı bir rapor kapalı bir yuvayı hâlâ
 * kullanıyorsa çalışmaya devam ediyor — kayıt defteri alanı tanıyor, yalnızca
 * seçicide görünmüyor.
 */
export async function describeDatasetsWithCodes() {
  const [product, company] = await Promise.all([
    listCustomCodeFields("PRODUCT"),
    listCustomCodeFields("COMPANY"),
  ]);
  return describeDatasets().map((ds) => ({
    ...ds,
    fields: ds.fields.flatMap((f) => {
      const match = CODE_FIELD_PATTERN.exec(f.key);
      if (!match) return [f];
      const list = match[1] === "product" ? product : company;
      const field = list.find((x) => x.slot === Number(match[2]));
      return field?.isActive ? [{ ...f, label: field.label }] : [];
    }),
  }));
}
