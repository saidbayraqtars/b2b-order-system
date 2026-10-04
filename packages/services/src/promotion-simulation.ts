import { prisma } from "@repo/database";
import { CUSTOM_CODE_SELECT, customCodeValuesOf } from "./custom-codes";
import { BusinessError } from "./errors";
import { Dec, ZERO, round2, type Money } from "./money";
import { qty } from "./quantity";
import { applyPromotions, type CompiledPromotion } from "./promotion-engine";
import type { EngineLine } from "./promotion-registry";
import { compileAction, compileCondition } from "./promotion-registry";
import { UNTRADED_ORDER_STATUSES } from "./order-status";

// Kampanya simülatörü — "bu kampanyayı açsaydım geçen ay ne kadar indirim
// verirdim?"
//
// Motor **ve** sipariş geçmişi zaten var; eksik olan tek şey ikisini bir araya
// getirmekti. Pahalı bir hatayı yayına almadan yakalıyor: %20'lik bir kampanya
// tanımlayıp "bir deneyelim" demek, geçen ayın cirosunun beşte birini
// kaybetmeyi göze almak demek.
//
// **Hiçbir şey yazmıyor.** Kuru koşu: siparişler okunuyor, motor çalıştırılıyor,
// sonuç dönüyor. `PromotionRedemption` satırı açılmıyor, sipariş tutarları
// değişmiyor.

export interface SimulatedOrder {
  orderId: string;
  orderNumber: string;
  companyName: string;
  createdAt: string;
  /** Siparişin o günkü net mal bedeli — kampanya öncesi. */
  netGoods: string;
  /** Bu kampanyanın vereceği indirim. */
  discount: string;
  /** İndirimin sipariş içindeki payı, yüzde. */
  share: string;
}

export interface SimulationResult {
  promotionId: string;
  promotionName: string;
  /** Kampanya şu an açık mı — kapalıyken de denenebiliyor, asıl amacı bu. */
  enabled: boolean;
  from: string;
  to: string;
  /** Aralıktaki gerçekleşmiş sipariş sayısı. */
  ordersConsidered: number;
  /** Kampanyanın uygulanacağı sipariş sayısı. */
  ordersMatched: number;
  /** Aralıktaki toplam net mal bedeli. */
  totalNetGoods: string;
  /** Toplam indirim. */
  totalDiscount: string;
  /** İndirimin ciroya oranı, yüzde. */
  discountShare: string;
  /** Kampanyanın hediye ettiği kalem sayısı (adet toplamı). */
  giftUnits: number;
  /** Kota yüzünden uygulanamayan sipariş sayısı. */
  blockedByQuota: number;
  /** En çok indirim gören siparişler — en fazla 100 satır. */
  orders: SimulatedOrder[];
}

const MAX_ORDERS = 5000;
const PREVIEW_ROWS = 100;

/**
 * Bir kampanyayı geçmiş siparişlerde kuru kuruya çalıştırır.
 *
 * Üç ayrıntı sonucu gerçekçi kılıyor:
 *
 *  1. **Satır neti kampanya öncesine geri sarılıyor**: `lineTotal` kayıtlı
 *     kampanyanın indirimini zaten düşmüş. `lineTotal + promotionDiscount`,
 *     firma iskontosu uygulanmış ama kampanya uygulanmamış hâl — motorun
 *     beklediği taban.
 *  2. **Kotalar zaman sırasına göre tükeniyor.** Kullanım limiti olan bir
 *     kampanya, gerçekte de ilk gelen siparişlere uygulanırdı; simülasyon
 *     siparişleri eskiden yeniye yürüyor.
 *  3. **`previousOrderCount` o günkü değeriyle**: "ilk sipariş" koşulu, bugün
 *     otuz siparişi olan bir müşterinin ilk siparişinde de doğruydu.
 */
export async function simulatePromotion(
  promotionId: string,
  range: { from: string; to: string },
): Promise<SimulationResult> {
  const promo = await prisma.promotion.findUnique({
    where: { id: promotionId },
    select: {
      id: true,
      name: true,
      code: true,
      priority: true,
      stopFurther: true,
      conditionMode: true,
      conditions: true,
      actions: true,
      enabled: true,
      usageLimit: true,
      perCompanyLimit: true,
    },
  });
  if (!promo) {
    throw new BusinessError("PROMOTION_NOT_FOUND", "Kampanya bulunamadı");
  }

  let compiled: CompiledPromotion;
  try {
    compiled = {
      id: promo.id,
      name: promo.name,
      code: promo.code,
      priority: promo.priority,
      stopFurther: promo.stopFurther,
      conditionMode: promo.conditionMode,
      conditions: asArray(promo.conditions).map(compileCondition),
      actions: asArray(promo.actions).map(compileAction),
    };
  } catch {
    throw new BusinessError(
      "INVALID_PROMOTION",
      "Kampanya geçersiz kural içeriyor; simüle edilemiyor.",
    );
  }

  const [fy, fm, fd] = range.from.split("-").map(Number);
  const [ty, tm, td] = range.to.split("-").map(Number);
  const start = new Date(fy!, (fm ?? 1) - 1, fd ?? 1, 0, 0, 0, 0);
  const end = new Date(ty!, (tm ?? 1) - 1, td ?? 1, 23, 59, 59, 999);
  if (end <= start) {
    throw new BusinessError("INVALID_PERIOD", "Bitiş tarihi başlangıçtan sonra olmalı.");
  }

  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      status: { notIn: [...UNTRADED_ORDER_STATUSES] },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_ORDERS,
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      companyId: true,
      paymentMethod: true,
      shippingFee: true,
      // Özel kodlar bugünkü değeriyle: kodun geçmişi tutulmuyor. Bir firmanın
      // bölgesi değiştiyse simülasyon onu yeni bölgesinde sayar.
      company: { select: { name: true, customerGroupId: true, ...CUSTOM_CODE_SELECT } },
      items: {
        select: {
          variantId: true,
          quantity: true,
          lineTotal: true,
          promotionDiscount: true,
          isGift: true,
          variant: {
            select: {
              productId: true,
              product: { select: { categoryId: true, ...CUSTOM_CODE_SELECT } },
            },
          },
        },
      },
    },
  });

  // "Kaçıncı sipariş" o günkü değeriyle: firma başına sayaç, zaman sırasında
  // artıyor. Bugünkü toplamı kullanmak, `FIRST_ORDER` koşulunu hiçbir siparişte
  // doğru kılmazdı.
  const seenByCompany = new Map<string, number>();
  // Kotalar da zaman sırasında tükeniyor.
  let usedTotal = 0;
  const usedByCompany = new Map<string, number>();

  const rows: SimulatedOrder[] = [];
  let totalDiscount = ZERO;
  let totalNetGoods = ZERO;
  let matched = 0;
  let giftUnits = 0;
  let blockedByQuota = 0;

  for (const order of orders) {
    const previousOrderCount = seenByCompany.get(order.companyId) ?? 0;
    seenByCompany.set(order.companyId, previousOrderCount + 1);

    // Hediye satırları tabana girmiyor: bedelsiz bir kalem zaten sıfır net ve
    // kampanyanın indirim tabanı değil.
    const lines: EngineLine[] = order.items
      .filter((i) => !i.isGift)
      .map((i) => ({
        key: i.variantId,
        productId: i.variant.productId,
        categoryId: i.variant.product.categoryId,
        quantity: qty(i.quantity),
        // Kayıtlı kampanyanın indirimi geri ekleniyor: motorun beklediği taban
        // "firma iskontosu sonrası, kampanya öncesi".
        net: new Dec(i.lineTotal).add(i.promotionDiscount),
        productCodes: customCodeValuesOf(i.variant.product),
      }));
    if (lines.length === 0) continue;

    const orderNet = lines.reduce<Money>((sum, l) => sum.add(l.net), ZERO);
    totalNetGoods = totalNetGoods.add(orderNet);

    const companyUsed = usedByCompany.get(order.companyId) ?? 0;
    const quotaFull =
      (promo.usageLimit !== null && usedTotal >= promo.usageLimit) ||
      (promo.perCompanyLimit !== null && companyUsed >= promo.perCompanyLimit);

    if (quotaFull) {
      blockedByQuota += 1;
      continue;
    }

    const result = applyPromotions({
      lines,
      context: {
        companyId: order.companyId,
        customerGroupId: order.company.customerGroupId,
        paymentMethod: order.paymentMethod,
        previousOrderCount,
        // Kampanyanın tarih penceresi koşulları bu ana göre değerlendiriliyor.
        now: order.createdAt,
        companyCodes: customCodeValuesOf(order.company),
      },
      promotions: [compiled],
      shippingFee: new Dec(order.shippingFee),
    });

    const discount = result.total.add(result.shippingDiscount);
    if (result.applied.length === 0 || discount.lte(0)) {
      if (result.gifts.length === 0) continue;
    }

    matched += 1;
    usedTotal += 1;
    usedByCompany.set(order.companyId, companyUsed + 1);
    totalDiscount = totalDiscount.add(discount);
    giftUnits += result.gifts.reduce((sum, g) => sum + g.quantity, 0);

    rows.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      companyName: order.company.name,
      createdAt: order.createdAt.toISOString(),
      netGoods: round2(orderNet).toFixed(2),
      discount: round2(discount).toFixed(2),
      share: orderNet.isZero()
        ? "0.00"
        : round2(discount.div(orderNet).mul(100)).toFixed(2),
    });
  }

  rows.sort((a, b) => Number(b.discount) - Number(a.discount));

  return {
    promotionId: promo.id,
    promotionName: promo.name,
    enabled: promo.enabled,
    from: range.from,
    to: range.to,
    ordersConsidered: orders.length,
    ordersMatched: matched,
    totalNetGoods: round2(totalNetGoods).toFixed(2),
    totalDiscount: round2(totalDiscount).toFixed(2),
    discountShare: totalNetGoods.isZero()
      ? "0.00"
      : round2(totalDiscount.div(totalNetGoods).mul(100)).toFixed(2),
    giftUnits,
    blockedByQuota,
    orders: rows.slice(0, PREVIEW_ROWS),
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
