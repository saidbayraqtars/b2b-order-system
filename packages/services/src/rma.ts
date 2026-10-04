import { Prisma, prisma } from "@repo/database";
import {
  canTransitionReturn,
  type CreateReturnInput,
  type ReturnActionInput,
  type ReturnCondition,
  type ReturnFilterInput,
  type ReturnLineView,
  type ReturnStatus,
  type ReturnSummary,
  type ReturnView,
  type ReturnableLineView,
} from "@repo/types";
import { BusinessError } from "./errors";
import { round2, ZERO } from "./money";
import { assertQuantityScale, formatQuantity, qty, qtyAdd, qtySub } from "./quantity";
import { postStockMovement } from "./stock-ledger";

// İade (RMA).
//
// Sipariş iptali ile iadenin neden ayrı belgeler olduğu schema.prisma'daki
// "İADE (RMA)" başlığında yazılı. Bu dosya o belgenin kurallarını tutuyor ve
// hepsi tek cümleye bağlanıyor: **mal gelmeden hiçbir defter oynamaz.**
//
// Talep açmak ve kabul etmek kayıt işidir; stok girişi ile cari alacak yalnızca
// `RECEIVED` adımında, tek işlemin içinde yazılır. Kabul anında stok artırmak,
// yola çıkmamış — belki hiç çıkmayacak — malı satılabilir göstermek demekti.

type Tx = Prisma.TransactionClient;

/**
 * Kimin neyi göreceği. `label-render.ts`'teki `PrintScope` ile aynı biçim:
 * ikisi de boşsa süper admin, doluysa kısıt.
 */
export interface ReturnScope {
  companyId?: string | null;
  salesRepId?: string | null;
}

export interface ReturnActor {
  userId: string;
  /**
   * `returns.manage` izni var mı — yani kabul/ret/teslim alma yetkisi.
   *
   * Servise taşınmasının sebebi, bunun bir ekran kuralı değil belge kuralı
   * olması: yetkisi olmayan taraf kendi talebini yalnızca **iptal** edebilir,
   * ve bu kısıt uçtan uca test edilebilir bir yerde durmalı.
   */
  canManage: boolean;
}

function scopeWhere(scope: ReturnScope): Prisma.ReturnRequestWhereInput {
  return {
    ...(scope.companyId ? { companyId: scope.companyId } : {}),
    ...(scope.salesRepId ? { company: { salesRepId: scope.salesRepId } } : {}),
  };
}

/**
 * Hâlâ hak tüketen talepler.
 *
 * Reddedilmiş ya da iptal edilmiş talep hakkı geri verir: müşteri reddedilen
 * bir iadeyi düzeltip yeniden açabilmeli. Teslim alınmış olan vermez.
 */
const CONSUMING: readonly ReturnStatus[] = ["REQUESTED", "APPROVED", "RECEIVED"];

// ─────────────────────────────────────────────
// NE İADE EDİLEBİLİR
// ─────────────────────────────────────────────

/**
 * Bir siparişin iade edilebilir satırları.
 *
 * Sipariş **sevk edilmeden** iade edilemez: çıkmamış mal geri gelmez, o iş
 * iptaldir (`changeOrderStatus`). Ayrım kullanıcıya da böyle anlatılıyor,
 * çünkü ikisinin defterdeki sonucu farklı.
 */
export async function listReturnableLines(
  orderId: string,
  scope: ReturnScope,
): Promise<ReturnableLineView[]> {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.salesRepId ? { company: { salesRepId: scope.salesRepId } } : {}),
    },
    select: {
      id: true,
      status: true,
      items: {
        select: {
          id: true,
          variantId: true,
          productName: true,
          sku: true,
          quantity: true,
          quantityShipped: true,
          unitPrice: true,
          discount: true,
          vatRate: true,
        },
      },
    },
  });
  if (!order) {
    throw new BusinessError("ORDER_NOT_FOUND", "Sipariş bulunamadı");
  }
  if (order.status !== "SHIPPED" && order.status !== "DELIVERED") {
    throw new BusinessError(
      "INVALID_STATE",
      "Sevk edilmemiş sipariş iade edilemez — çıkmamış mal için siparişi iptal edin",
      { status: order.status },
    );
  }

  const returned = await returnedByOrderItem(prisma, order.id);

  return order.items.map((item) => {
    const shipped = shippedQuantity(item.quantityShipped, item.quantity);
    const already = returned.get(item.id) ?? 0;
    return {
      orderItemId: item.id,
      variantId: item.variantId,
      productName: item.productName,
      sku: item.sku,
      quantityOrdered: qty(item.quantity),
      quantityShipped: shipped,
      quantityReturned: already,
      returnableQuantity: Math.max(0, qtySub(shipped, already)),
      unitPrice: item.unitPrice.toFixed(2),
      discount: item.discount.toFixed(2),
      vatRate: item.vatRate,
    };
  });
}

/**
 * İadenin üst sınırı: sevk edilen adet.
 *
 * İrsaliye kesmeden çalışan kurulumlarda `quantityShipped` hiç dolmuyor —
 * sipariş SHIPPED/DELIVERED işaretleniyor ama sevkiyat belgesi açılmıyor. Orada
 * sıfırı üst sınır saymak, iadeyi bütünüyle imkânsız kılardı; siparişin kendi
 * adedi devreye giriyor. Kısmi sevkiyat kullanan kurulumda ise gerçek sayı
 * `quantityShipped` ve iade onu aşamaz.
 */
function shippedQuantity(
  quantityShipped: Prisma.Decimal | number,
  quantity: Prisma.Decimal | number,
): number {
  const shipped = qty(quantityShipped);
  return shipped > 0 ? shipped : qty(quantity);
}

async function returnedByOrderItem(
  client: Tx | typeof prisma,
  orderId: string,
  exceptReturnId?: string,
): Promise<Map<string, number>> {
  const rows = await client.returnItem.findMany({
    where: {
      returnRequest: {
        orderId,
        status: { in: [...CONSUMING] },
        ...(exceptReturnId ? { id: { not: exceptReturnId } } : {}),
      },
    },
    select: { orderItemId: true, quantity: true },
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.orderItemId, qtyAdd(map.get(row.orderItemId), row.quantity));
  }
  return map;
}

// ─────────────────────────────────────────────
// TALEP AÇMA
// ─────────────────────────────────────────────

/**
 * Satırın iade bedeli — satıldığı günün rakamlarıyla.
 *
 * Kampanya iskontosu adete bölünüyor, faturalamadaki dağıtımın aynısı: bedava
 * verilmiş bir mal (isGift) satır tutarı kadar kampanya iskontosu taşır, o mal
 * geri geldiğinde sıfır alacak yazması gerekir. Bölmeyi atlarsak müşteri hiç
 * ödemediği malın parasını alacak yazdırırdı.
 */
function lineAmounts(
  item: {
    quantity: Prisma.Decimal | number;
    unitPrice: Prisma.Decimal;
    discount: Prisma.Decimal;
    promotionDiscount: Prisma.Decimal;
    vatRate: number;
  },
  quantity: number,
): { promotionShare: Prisma.Decimal; net: Prisma.Decimal; gross: Prisma.Decimal } {
  const promotionShare =
    qty(item.quantity) > 0
      ? round2(item.promotionDiscount.mul(quantity).div(item.quantity))
      : ZERO;
  const gross = round2(item.unitPrice.sub(item.discount).mul(quantity));
  const net = gross.sub(promotionShare);
  const vat = round2(net.mul(item.vatRate).div(100));
  return { promotionShare, net, gross: net.add(vat) };
}

export async function createReturn(
  input: CreateReturnInput,
  actor: ReturnActor,
  scope: ReturnScope,
): Promise<ReturnView> {
  // Sipariş numarası üretimindeki desen: benzersizlik yarışını veritabanı
  // çözüyor, kod yalnızca bir kez daha deniyor.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const id = await prisma.$transaction((tx) => createInTx(tx, input, actor, scope));
      return getReturn(id, scope);
    } catch (err) {
      if (
        attempt === 0 &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        continue; // rmaNumber yarıştı — tekrar dene
      }
      throw err;
    }
  }
}

async function createInTx(
  tx: Tx,
  input: CreateReturnInput,
  actor: ReturnActor,
  scope: ReturnScope,
): Promise<string> {
  const order = await tx.order.findFirst({
    where: {
      id: input.orderId,
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.salesRepId ? { company: { salesRepId: scope.salesRepId } } : {}),
    },
    select: {
      id: true,
      orderNumber: true,
      companyId: true,
      status: true,
      currency: true,
      items: {
        select: {
          id: true,
          variantId: true,
          productName: true,
          sku: true,
          quantity: true,
          quantityShipped: true,
          unitPrice: true,
          discount: true,
          promotionDiscount: true,
          vatRate: true,
          variant: { select: { quantityScale: true } },
        },
      },
    },
  });
  if (!order) throw new BusinessError("ORDER_NOT_FOUND", "Sipariş bulunamadı");
  if (order.status !== "SHIPPED" && order.status !== "DELIVERED") {
    throw new BusinessError(
      "INVALID_STATE",
      "Sevk edilmemiş sipariş iade edilemez — çıkmamış mal için siparişi iptal edin",
      { status: order.status },
    );
  }

  const byId = new Map(order.items.map((i) => [i.id, i]));
  const returned = await returnedByOrderItem(tx, order.id);

  let refundTotal = ZERO;
  const lines: Prisma.ReturnItemCreateWithoutReturnRequestInput[] = [];
  const seen = new Set<string>();

  for (const wanted of input.items) {
    const item = byId.get(wanted.orderItemId);
    if (!item) {
      throw new BusinessError(
        "ORDER_ITEM_NOT_FOUND",
        "Sipariş satırı bu siparişe ait değil",
        { orderItemId: wanted.orderItemId },
      );
    }
    // Aynı satırı iki kez göndermek, üst sınır kontrolünü ikiye bölerek
    // aşmanın en kolay yolu: her biri tek başına sınırın altında kalır.
    if (seen.has(item.id)) {
      throw new BusinessError("INVALID_STATE", "Aynı satır iki kez gönderildi", {
        orderItemId: item.id,
      });
    }
    seen.add(item.id);

    assertQuantityScale(wanted.quantity, item.variant.quantityScale, item.sku);
    const allowed = qtySub(
      shippedQuantity(item.quantityShipped, item.quantity),
      returned.get(item.id),
    );
    if (wanted.quantity > allowed) {
      throw new BusinessError(
        "OVER_RETURN",
        `${item.productName}: en fazla ${formatQuantity(allowed)} iade edilebilir`,
        { orderItemId: item.id, requested: wanted.quantity, allowed },
      );
    }

    const amounts = lineAmounts(item, wanted.quantity);
    refundTotal = refundTotal.add(amounts.gross);
    lines.push({
      orderItem: { connect: { id: item.id } },
      variant: { connect: { id: item.variantId } },
      quantity: wanted.quantity,
      condition: wanted.condition ?? "RESELLABLE",
      productName: item.productName,
      sku: item.sku,
      unitPrice: item.unitPrice,
      discount: item.discount,
      promotionDiscount: amounts.promotionShare,
      vatRate: item.vatRate,
      lineTotal: amounts.net,
    });
  }

  if (lines.length === 0) {
    throw new BusinessError("NOTHING_TO_RETURN", "İade edilecek satır yok");
  }

  const created = await tx.returnRequest.create({
    data: {
      rmaNumber: await nextRmaNumber(tx),
      order: { connect: { id: order.id } },
      company: { connect: { id: order.companyId } },
      reason: input.reason,
      refundTotal,
      currency: order.currency,
      requestedBy: { connect: { id: actor.userId } },
      items: { create: lines },
    },
    select: { id: true },
  });
  return created.id;
}

async function nextRmaNumber(tx: Tx): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const dayStart = new Date(y, now.getMonth(), now.getDate());
  const dayEnd = new Date(y, now.getMonth(), now.getDate() + 1);

  const count = await tx.returnRequest.count({
    where: { createdAt: { gte: dayStart, lt: dayEnd } },
  });
  return `IAD-${y}${m}${d}-${String(count + 1).padStart(4, "0")}`;
}

// ─────────────────────────────────────────────
// KARAR VE TESLİM ALMA
// ─────────────────────────────────────────────

export async function actOnReturn(
  returnId: string,
  input: ReturnActionInput,
  actor: ReturnActor,
  scope: ReturnScope,
): Promise<ReturnView> {
  await prisma.$transaction((tx) => actInTx(tx, returnId, input, actor, scope));
  return getReturn(returnId, scope);
}

async function actInTx(
  tx: Tx,
  returnId: string,
  input: ReturnActionInput,
  actor: ReturnActor,
  scope: ReturnScope,
): Promise<void> {
  const request = await tx.returnRequest.findFirst({
    where: { id: returnId, ...scopeWhere(scope) },
    select: {
      id: true,
      rmaNumber: true,
      status: true,
      companyId: true,
      orderId: true,
      creditTransactionId: true,
      order: { select: { orderNumber: true, paymentMethod: true } },
      items: {
        select: {
          id: true,
          orderItemId: true,
          variantId: true,
          variant: { select: { quantityScale: true } },
          quantity: true,
          condition: true,
          productName: true,
          unitPrice: true,
          discount: true,
          vatRate: true,
          orderItem: {
            select: {
              quantity: true,
              quantityShipped: true,
              unitPrice: true,
              discount: true,
              promotionDiscount: true,
              vatRate: true,
            },
          },
        },
      },
    },
  });
  if (!request) throw new BusinessError("RETURN_NOT_FOUND", "İade talebi bulunamadı");

  if (!canTransitionReturn(request.status, input.status)) {
    throw new BusinessError(
      "INVALID_RETURN_TRANSITION",
      `İade ${request.rmaNumber} bu durumdan ${input.status} durumuna geçemez`,
      { from: request.status, to: input.status },
    );
  }

  // Yetkisi olmayan taraf — talebi açan alıcı — yalnızca vazgeçebilir. Kabul,
  // ret ve teslim alma satıcının kararı.
  if (!actor.canManage && input.status !== "CANCELLED") {
    throw new BusinessError("FORBIDDEN", "İade kararı verme yetkiniz yok");
  }

  if (input.status !== "RECEIVED") {
    await tx.returnRequest.update({
      where: { id: request.id },
      data: {
        status: input.status,
        decisionNote: input.note ?? null,
        decidedById: actor.userId,
        decidedAt: new Date(),
      },
    });
    return;
  }

  await receiveInTx(tx, request, input, actor);
}

type LoadedReturn = {
  id: string;
  rmaNumber: string;
  companyId: string;
  orderId: string;
  order: { orderNumber: string; paymentMethod: string };
  items: Array<{
    id: string;
    orderItemId: string;
    variantId: string;
    variant: { quantityScale: number };
    quantity: Prisma.Decimal;
    condition: ReturnCondition;
    productName: string;
    orderItem: {
      quantity: Prisma.Decimal;
      quantityShipped: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      discount: Prisma.Decimal;
      promotionDiscount: Prisma.Decimal;
      vatRate: number;
    };
  }>;
};

/**
 * Mal geldi: satırlar gelen miktara göre düzeltilir, sağlam olanlar stoka
 * girer, bedeli cariye alacak yazılır. Hepsi tek işlemde — yarısı yazılmış bir
 * iade, ne stoğu ne cariyi doğru gösterir.
 */
async function receiveInTx(
  tx: Tx,
  request: LoadedReturn,
  input: ReturnActionInput,
  actor: ReturnActor,
): Promise<void> {
  const corrections = new Map(
    (input.items ?? []).map((i) => [i.returnItemId, i] as const),
  );
  for (const key of corrections.keys()) {
    if (!request.items.some((item) => item.id === key)) {
      throw new BusinessError(
        "RETURN_ITEM_NOT_FOUND",
        "Düzeltilen satır bu iade talebinde yok",
        { returnItemId: key },
      );
    }
  }

  // Talep açıldıktan sonra başka bir iade aynı satırdan pay almış olabilir.
  // Üst sınır bu yüzden burada yeniden ölçülüyor; bu talebin kendi satırları
  // hesaptan düşülüyor, yoksa kendi kendini engellerdi.
  const returnedElsewhere = await returnedByOrderItem(
    tx,
    request.orderId,
    request.id,
  );

  let refundTotal = ZERO;

  for (const item of request.items) {
    const correction = corrections.get(item.id);
    const requested = qty(item.quantity);
    const quantity = correction ? correction.quantity : requested;
    const condition = correction?.condition ?? item.condition;

    if (correction) {
      assertQuantityScale(quantity, item.variant.quantityScale, item.productName);
    }
    if (quantity > requested) {
      throw new BusinessError(
        "OVER_RETURN",
        `${item.productName}: talep edilenden fazlası teslim alınamaz`,
        { returnItemId: item.id, requested: quantity, allowed: requested },
      );
    }
    const roomLeft = qtySub(
      shippedQuantity(item.orderItem.quantityShipped, item.orderItem.quantity),
      returnedElsewhere.get(item.orderItemId),
    );
    if (quantity > roomLeft) {
      throw new BusinessError(
        "OVER_RETURN",
        `${item.productName}: en fazla ${formatQuantity(roomLeft)} iade edilebilir`,
        { returnItemId: item.id, requested: quantity, allowed: roomLeft },
      );
    }

    const amounts = lineAmounts(item.orderItem, quantity);
    refundTotal = refundTotal.add(amounts.gross);

    await tx.returnItem.update({
      where: { id: item.id },
      data: {
        quantity,
        condition,
        promotionDiscount: amounts.promotionShare,
        lineTotal: amounts.net,
      },
    });

    // Hasarlı mal stoka girmez ama bedeli yine alacak yazılır: müşteri malı
    // iade etti, kırık olması bizim ile kargonun arasındaki bir mesele.
    if (condition === "RESELLABLE" && quantity > 0) {
      await postStockMovement(tx, {
        variantId: item.variantId,
        direction: "IN",
        quantity,
        source: "RETURN",
        description: `İade ${request.rmaNumber} — sipariş ${request.order.orderNumber}`,
        orderId: request.orderId,
        // Parti bilerek boş: geri gelen kutunun hangi partiden çıktığını
        // kimse bilmiyor ve tahmin etmek, SKT takibini sessizce yalan yapardı.
        lotId: null,
        recordedById: actor.userId,
      });
    }
  }

  const creditId = await writeCredit(tx, request, refundTotal, actor.userId);

  await tx.returnRequest.update({
    where: { id: request.id },
    data: {
      status: "RECEIVED",
      decisionNote: input.note ?? undefined,
      decidedById: actor.userId,
      decidedAt: new Date(),
      receivedAt: new Date(),
      refundTotal,
      ...(creditId ? { creditTransactionId: creditId } : {}),
    },
  });
}

/**
 * Cari alacak — yalnızca siparişin gerçekten borç doğurduğu durumda.
 *
 * `order-lifecycle.ts`'teki iptal ile aynı kural ve aynı sebeple: kredi
 * kartıyla ya da peşin ödenmiş bir siparişin cari borcu hiç doğmamıştır,
 * iadesine alacak yazmak müşteriyi iki kez alacaklı gösterirdi. O siparişlerde
 * para, geldiği kanaldan geri veriliyor; belgede duran `refundTotal` ne kadar
 * ödeneceğini söylüyor.
 */
async function writeCredit(
  tx: Tx,
  request: LoadedReturn,
  refundTotal: Prisma.Decimal,
  actorId: string,
): Promise<string | null> {
  if (refundTotal.lte(0)) return null;

  const debit = await tx.transaction.findFirst({
    where: { orderId: request.orderId, type: "DEBIT" },
    select: { id: true },
  });
  if (!debit) return null;

  const credit = await tx.transaction.create({
    data: {
      company: { connect: { id: request.companyId } },
      type: "CREDIT",
      amount: refundTotal,
      description: `İade ${request.rmaNumber} — sipariş ${request.order.orderNumber}`,
      order: { connect: { id: request.orderId } },
      recordedBy: { connect: { id: actorId } },
    },
    select: { id: true },
  });

  await tx.company.update({
    where: { id: request.companyId },
    data: { currentBalance: { decrement: refundTotal } },
  });

  return credit.id;
}

// ─────────────────────────────────────────────
// OKUMA
// ─────────────────────────────────────────────

export async function listReturns(
  filter: ReturnFilterInput,
  scope: ReturnScope,
): Promise<ReturnSummary[]> {
  const rows = await prisma.returnRequest.findMany({
    where: {
      ...scopeWhere(scope),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.companyId ? { companyId: filter.companyId } : {}),
      ...(filter.orderId ? { orderId: filter.orderId } : {}),
      ...(filter.openOnly ? { status: { in: ["REQUESTED", "APPROVED"] } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: filter.limit ?? 100,
    select: { ...SUMMARY_SELECT, _count: { select: { items: true } } },
  });

  return rows.map((row) => ({
    ...toSummary(row),
    itemCount: row._count.items,
  }));
}

export async function getReturn(
  returnId: string,
  scope: ReturnScope,
): Promise<ReturnView> {
  const row = await prisma.returnRequest.findFirst({
    where: { id: returnId, ...scopeWhere(scope) },
    select: {
      ...SUMMARY_SELECT,
      items: {
        select: {
          id: true,
          orderItemId: true,
          variantId: true,
          productName: true,
          sku: true,
          quantity: true,
          condition: true,
          unitPrice: true,
          discount: true,
          promotionDiscount: true,
          vatRate: true,
          lineTotal: true,
        },
        orderBy: { productName: "asc" },
      },
    },
  });
  if (!row) throw new BusinessError("RETURN_NOT_FOUND", "İade talebi bulunamadı");

  return {
    ...toSummary(row),
    items: row.items.map(
      (item): ReturnLineView => ({
        id: item.id,
        orderItemId: item.orderItemId,
        variantId: item.variantId,
        productName: item.productName,
        sku: item.sku,
        quantity: qty(item.quantity),
        condition: item.condition,
        unitPrice: item.unitPrice.toFixed(2),
        discount: item.discount.toFixed(2),
        promotionDiscount: item.promotionDiscount.toFixed(2),
        vatRate: item.vatRate,
        lineTotal: item.lineTotal.toFixed(2),
      }),
    ),
  };
}

const SUMMARY_SELECT = {
  id: true,
  rmaNumber: true,
  status: true,
  orderId: true,
  companyId: true,
  reason: true,
  decisionNote: true,
  refundTotal: true,
  currency: true,
  decidedAt: true,
  receivedAt: true,
  createdAt: true,
  creditTransactionId: true,
  order: { select: { orderNumber: true } },
  company: { select: { name: true } },
  requestedBy: { select: { name: true } },
  decidedBy: { select: { name: true } },
} satisfies Prisma.ReturnRequestSelect;

type SummaryRow = Prisma.ReturnRequestGetPayload<{ select: typeof SUMMARY_SELECT }>;

function toSummary(row: SummaryRow): Omit<ReturnView, "items"> {
  return {
    id: row.id,
    rmaNumber: row.rmaNumber,
    status: row.status,
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    companyId: row.companyId,
    companyName: row.company.name,
    reason: row.reason,
    decisionNote: row.decisionNote,
    refundTotal: row.refundTotal.toFixed(2),
    currency: row.currency,
    requestedByName: row.requestedBy.name,
    decidedByName: row.decidedBy?.name ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    creditTransactionId: row.creditTransactionId,
  };
}
