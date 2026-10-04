import type { Prisma } from "@prisma/client";
import type { DiscountType } from "@repo/types";
import { BusinessError } from "./errors";
import { Dec, ZERO, round2, round6 } from "./money";

type Decimal = Prisma.Decimal;

// ── Pure inputs (kept independent of Prisma row shapes so this is unit-testable) ──

export interface PriceRow {
  /** null = default list price (no group). */
  customerGroupId: string | null;
  minQuantity: number;
  /**
   * **TL cinsinden** birim fiyat. Yabancı para birimindeki satırlar buraya
   * gelmeden önce çevriliyor (`convertPriceRows`), böylece iskonto, hacim
   * kademesi ve KDV tek para biriminde hesaplanıyor ve bu dosya döviz diye bir
   * şey bilmiyor.
   */
  price: Decimal;
  /** Listelendiği para birimi; yoksa TL. Yalnızca belgeye basmak için taşınır. */
  currency?: string | null;
  /** O para birimindeki orijinal tutar; yoksa `price`. */
  listPrice?: Decimal;
  /**
   * Paket birimi fiyatıysa o birim; yoksa taban birim fiyatı. Paket fiyatı
   * paket başınadır ve `minQuantity` paket sayısıyla okunur.
   */
  unitId?: string | null;
}

/** Satırın alındığı paket birimi (koli, palet). */
export interface PriceUnit {
  id: string;
  /** 1 paket kaç taban birim eder. */
  factor: Decimal;
}

export interface DiscountRow {
  categoryId: string | null;
  productId: string | null;
  discountType: DiscountType;
  value: Decimal;
}

export interface ResolvePriceInput {
  /** All Price rows belonging to the variant. */
  prices: PriceRow[];
  /** The buying company's customer group (null = no group → default prices only). */
  customerGroupId: string | null;
  quantity: number;
  productId: string;
  categoryId: string;
  /** The buying company's discounts (all of them; matching happens here). */
  discounts: DiscountRow[];
  /**
   * Hacim (turnover) tier rate for this company, or null/0 when none applies.
   * Resolved once per request — see `resolveVolumeDiscount` — because it is a
   * property of the customer, not of the line.
   */
  volumeDiscountPercent?: Decimal | null;
  /**
   * Çift birim çarpanı: 1 satış birimi kaç fiyat birimi eder.
   *
   * Gıda toptanında fiyat kg üzerinden konuşulur, satış kasa üzerinden yapılır.
   * Çarpım **burada**, iskontodan önce yapılıyor: böylece firma iskontosu,
   * hacim merdiveni ve KDV zaten satış birimi başına düşen fiyatla çalışır ve
   * hiçbiri kg/kasa diye bir şey bilmek zorunda kalmaz. Sonradan çarpsaydık
   * FIXED iskonto (kg başına 2 ₺) sessizce kasa başına 2 ₺ olurdu.
   *
   * Boş ya da 1 ise hiçbir şey değişmez — klasik adet/koli düzeni bu yoldan
   * hiç geçmemiş gibi davranır.
   */
  unitFactor?: Decimal | null;
  /**
   * Satır bir paket birimiyle alınıyorsa o birim. `quantity` yine taban
   * birimdedir; paket sayısı `quantity / factor`.
   */
  unit?: PriceUnit | null;
}

/** Paket düzeyindeki rakamlar — müşterinin gördüğü "koli 100 ₺". */
export interface ResolvedPackagePrice {
  unitId: string;
  factor: Decimal;
  /** Paket sayısı. */
  count: number;
  /** İskontodan önce paket fiyatı. */
  unitPrice: Decimal;
  /** Paket başına toplam iskonto. */
  discountPerUnit: Decimal;
  /** Paket başına net. */
  netUnitPrice: Decimal;
}

export interface ResolvedPrice {
  /** Base group/list price before any discount, per unit. */
  unitPrice: Decimal;
  /**
   * **Total** discount per unit: the company's own plus the hacim tier's.
   * Always `unitPrice - netUnitPrice`, which is what the order snapshot,
   * invoicing and the catalogue all read.
   */
  discountPerUnit: Decimal;
  /** The share of `discountPerUnit` from CompanyDiscount alone. */
  companyDiscountPerUnit: Decimal;
  /** The share of `discountPerUnit` from the hacim tier alone. */
  volumeDiscountPerUnit: Decimal;
  /** unitPrice - discountPerUnit, floored at 0, per unit. */
  netUnitPrice: Decimal;
  /** netUnitPrice * quantity, excl. VAT. */
  lineNet: Decimal;
  /** Seçilen kademenin listelendiği para birimi ("TRY" ise dövizsiz satır). */
  listCurrency: string;
  /** O para birimindeki birim liste fiyatı — belgede "100 USD" diye basılan. */
  listUnitPrice: Decimal;
  /**
   * Satır paketle alındıysa paket düzeyindeki rakamlar; yoksa null. Bu
   * durumda yukarıdaki birim alanları taban birime altı ondalıkla inmiştir.
   */
  package: ResolvedPackagePrice | null;
}

/**
 * From a set of same-scope price rows, pick the best tier for `quantity`:
 * the row with the highest minQuantity that is still <= quantity.
 * Tie-break: the lowest price. Returns null if none applies.
 */
function pickTier(rows: PriceRow[], quantity: number): PriceRow | null {
  // Kademe eşiği tam sayı ve taban kademe "en az 1". Kesirli satışta 0,75 kg
  // o eşiğin altında kalıp fiyatsız görünüyordu; 1'in altındaki miktar taban
  // kademeden fiyatlanır. Tam sayı satışta (miktar >= 1) hiçbir şey değişmez.
  const threshold = Math.max(quantity, 1);
  let best: PriceRow | null = null;
  for (const row of rows) {
    if (row.minQuantity > threshold) continue;
    if (
      best === null ||
      row.minQuantity > best.minQuantity ||
      (row.minQuantity === best.minQuantity && row.price.lt(best.price))
    ) {
      best = row;
    }
  }
  // Satırın kendisi dönüyor, yalnızca fiyatı değil: hangi kademenin seçildiği
  // belgeye basılacak para birimini de belirliyor.
  return best;
}

/**
 * Resolve the net unit price for a variant given quantity, the company's
 * customer group, its discounts and its hacim tier.
 *
 * Precedence:
 *  1. Base price = group-specific tier if present, else default (null-group) tier.
 *  2. Company discount = product-specific if present, else category-specific.
 *  3. Hacim tier percent, off what is left after step 2.
 *
 * Step 3 compounds rather than adding to step 2 — iskonto üstüne iskonto, the
 * way it is quoted in trade: 20% then 5% is 24% off, not 25%. Adding the rates
 * instead would let a generous private deal plus a top tier reach 100% and give
 * the goods away.
 *
 * Every screen that shows a price goes through here (catalogue, cart, quote,
 * order), so the number a customer sees browsing is the number it is charged.
 *
 * Throws BusinessError("NO_PRICE") if neither a group nor a default price exists.
 */
export function resolvePrice(input: ResolvePriceInput): ResolvedPrice {
  const { prices, customerGroupId, quantity, productId, categoryId, discounts } =
    input;

  // Taban birim satırları: `unitId` yok. Paket satırları yalnızca o paketle
  // alınan satırda okunur — adetle alan müşteri koli fiyatını görmez.
  const baseRows = prices.filter((p) => (p.unitId ?? null) === null);
  const unit = input.unit && input.unit.factor.gt(ZERO) ? input.unit : null;
  const unitRows = unit ? prices.filter((p) => p.unitId === unit.id) : [];
  const packageCount = unit ? new Dec(quantity).div(unit.factor).toNumber() : 0;

  // Sıra: grubun paket fiyatı → grubun taban fiyatı × çarpan → listenin paket
  // fiyatı → listenin taban fiyatı × çarpan. Grup birimden önce gelir: bayiyle
  // konuşulmuş adet fiyatı, herkese açık koli fiyatıyla ezilmemeli.
  const tierFor = (groupId: string | null) => {
    const unitTier = unit
      ? pickTier(
          unitRows.filter((p) => p.customerGroupId === groupId),
          packageCount,
        )
      : null;
    if (unitTier) return { row: unitTier, perPackage: true };
    const baseTier = pickTier(
      baseRows.filter((p) => p.customerGroupId === groupId),
      quantity,
    );
    return baseTier ? { row: baseTier, perPackage: false } : null;
  };

  const picked =
    (customerGroupId === null ? null : tierFor(customerGroupId)) ?? tierFor(null);
  if (picked === null) {
    throw new BusinessError("NO_PRICE", "Ürün için fiyat tanımlı değil", {
      productId,
    });
  }

  const chosen = picked.row;

  // Fiyat birimi → satış birimi. `listPrice` çarpılmıyor: belgede basılacak
  // olan "84,50 ₺/kg" satırı, kg fiyatının kendisi. Paket fiyatı zaten paketin
  // son fiyatıdır, ona çift birim çarpanı uygulanmaz.
  const factor = input.unitFactor;
  let base =
    !picked.perPackage && factor && factor.gt(ZERO) && !factor.eq(1)
      ? chosen.price.mul(factor)
      : chosen.price;
  // Paketle alınan satır: bütün hesap paket başına yapılır (müşterinin gördüğü
  // "koli 100 ₺, %10 iskonto = 90 ₺" kuruşuyla tutsun), sonra taban birime
  // altı ondalıkla iner.
  if (unit && !picked.perPackage) base = base.mul(unit.factor);
  const unitPrice = round2(base);
  const companyDiscountPerUnit = round2(
    // FIXED iskonto taban birim başınadır; paket başına çarpanla büyür.
    computeDiscount(base, productId, categoryId, discounts, unit?.factor ?? null),
  );

  // Floored before the tier is applied: a FIXED discount larger than the price
  // would otherwise make the tier's percentage negative and *add* money back.
  let afterCompany = unitPrice.sub(companyDiscountPerUnit);
  if (afterCompany.lt(ZERO)) afterCompany = ZERO;

  const percent = input.volumeDiscountPercent;
  const volumeDiscountPerUnit =
    percent && percent.gt(ZERO)
      ? round2(afterCompany.mul(percent).div(100))
      : ZERO;

  const discountPerUnit = companyDiscountPerUnit.add(volumeDiscountPerUnit);
  let netUnitPrice = afterCompany.sub(volumeDiscountPerUnit);
  if (netUnitPrice.lt(ZERO)) netUnitPrice = ZERO;
  netUnitPrice = round2(netUnitPrice);

  if (unit) {
    const perBase = (d: Decimal) => round6(d.div(unit.factor));
    const list = chosen.listPrice ?? chosen.price;
    const listPackage = picked.perPackage ? list : list.mul(unit.factor);
    return {
      unitPrice: perBase(unitPrice),
      discountPerUnit: perBase(discountPerUnit),
      companyDiscountPerUnit: perBase(companyDiscountPerUnit),
      volumeDiscountPerUnit: perBase(volumeDiscountPerUnit),
      netUnitPrice: perBase(netUnitPrice),
      // Satır toplamı paket üzerinden: 2 koli × 90 ₺ = 180 ₺, 24 × 7,5 değil
      // (ikisi burada eşit, ama bölünemeyen fiyatta yalnız bu kuruşu tutar).
      lineNet: round2(netUnitPrice.mul(packageCount)),
      listCurrency: chosen.currency ?? "TRY",
      listUnitPrice: round2(listPackage.div(unit.factor)),
      package: {
        unitId: unit.id,
        factor: unit.factor,
        count: packageCount,
        unitPrice,
        discountPerUnit,
        netUnitPrice,
      },
    };
  }

  return {
    unitPrice,
    discountPerUnit,
    companyDiscountPerUnit,
    volumeDiscountPerUnit,
    netUnitPrice,
    lineNet: round2(netUnitPrice.mul(quantity)),
    listCurrency: chosen.currency ?? "TRY",
    listUnitPrice: chosen.listPrice ?? unitPrice,
    package: null,
  };
}

/** Product-specific discount wins over category-specific. Returns 0 if none. */
function computeDiscount(
  base: Decimal,
  productId: string,
  categoryId: string,
  discounts: DiscountRow[],
  /** Paket satırında FIXED iskontonun çarpanı (taban birim başına → paket başına). */
  fixedScale: Decimal | null = null,
): Decimal {
  const match =
    discounts.find((d) => d.productId === productId) ??
    discounts.find((d) => d.categoryId === categoryId);
  if (!match) return ZERO;

  if (match.discountType === "PERCENTAGE") {
    return base.mul(match.value).div(100);
  }
  // FIXED: absolute amount off per unit, never below 0.
  const off = fixedScale ? match.value.mul(fixedScale) : match.value;
  return off.gt(base) ? base : off;
}
