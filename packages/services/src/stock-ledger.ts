import { Prisma, prisma } from "@repo/database";
import type { StockDirection, StockMovementSource } from "@repo/types";
import { BusinessError } from "./errors";

type Tx = Prisma.TransactionClient;

// Stok hareket defteri.
//
// `ProductVariant.stock` bir sayıydı ve nasıl o sayı olduğunu kimse bilmiyordu:
// sipariş düşürüyor, ERP senkronu eziyor, elle düzeltme üstüne yazıyordu, hiçbiri
// iz bırakmıyordu. Sayım tutmadığında bakılacak bir yer yoktu.
//
// Bu modül kasa defterinin (cash.ts) stok karşılığı ve aynı iki kuralı taşır:
//
//  * Ekle-only. Yanlış kayıt silinmez; kendisine bağlı ters kayıtla düzeltilir.
//  * Bakiye ile hareket aynı işlemde yazılır. Stoku değiştiren **tek kapı**
//    `postStockMovement`; buradan geçmeyen her yazma defteri yalancı yapar.
//
// Üçüncü kural bu deftere özel: **toplam, defterin bakiyesidir.** Daha önce
// `ProductVariant.stock` depo kırılımının toplamı olarak yeniden hesaplanıyordu;
// bu, depo bilmeyen sipariş düşüşlerini ilk ERP senkronunda siliyordu. Artık her
// iki sayı da aynı hareketin farkı kadar oynar: depo adı verilmişse kırılım da,
// her hâlde toplam da.

// ─────────────────────────────────────────────
// TEK KAPI
// ─────────────────────────────────────────────

export interface PostStockMovementInput {
  variantId: string;
  /** Depo adı verilirse `VariantStock` kırılımı da oynar; verilmezse yalnız toplam. */
  warehouseId?: string | null;
  direction: StockDirection;
  /** Pozitif tam sayı; işareti `direction` taşır. */
  quantity: number;
  source: StockMovementSource;
  description?: string | null;
  occurredAt?: Date;
  orderId?: string | null;
  reversalOfId?: string | null;
  recordedById?: string | null;
  /**
   * **Toplam** bakiyenin eksiye düşmesine izin ver.
   *
   * Sipariş yolu için açılır: satış zaten `buildQuote` içinde stoka bakılarak
   * kabul edilmiştir ve iki eşzamanlı siparişin son adedi paylaşması siparişi
   * düşürmek için yeterli bir sebep değil — mal borcu doğar, defter de bunu eksi
   * bakiye olarak gösterir. Elle giriş ve sayım için kapalı: orada eksiye düşüren
   * sayı bir hata, çoğu zaman yanlış yazılmış bir adet.
   *
   * Aktarımın çıkış bacağı da açar, ama başka bir sebeple: aktarım toplamı
   * değiştirmez, iki satır hâlinde yazıldığı için toplam yalnızca iki yazma
   * arasında düşer. O aradaki değeri kısıt saymak, aktarımı toplamın tamamına
   * bakan yanlış bir hatayla reddederdi — asıl kısıt kaynak deponun adedi.
   */
  allowNegative?: boolean;
  /**
   * Depo kırılımının eksiye düşmesine izin ver. Verilmezse `allowNegative`i
   * izler; aktarım ikisini bilerek ayırır.
   */
  allowNegativeWarehouse?: boolean;
}

export interface PostedStockMovement {
  id: string;
  variantId: string;
  direction: StockDirection;
  quantity: number;
  /** Bu hareketten sonraki toplam eldeki adet. */
  balance: number;
}

/**
 * Bir hareket yaz ve stoku onunla birlikte oynat.
 *
 * Kendi işlemini açmaz, dışarıdan alır: sipariş oluşturma ve iptal zaten bir
 * işlemin içinde koşuyor ve geri alınan bir siparişten sağ çıkan stok hareketi
 * hiç hareket olmamasından kötüdür.
 */
export async function postStockMovement(
  tx: Tx,
  input: PostStockMovementInput,
): Promise<PostedStockMovement> {
  const quantity = Math.trunc(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new BusinessError("INVALID_STOCK", "Adet sıfırdan büyük olmalıdır");
  }

  const delta = input.direction === "IN" ? quantity : -quantity;

  // Önce oku-sonra-yaz yerine doğrudan artır/azalt: iki eşzamanlı siparişin aynı
  // varyantı okuyup aynı sonucu yazması (lost update) böyle imkânsız. Sonuç
  // satırdan geri okunuyor, `balanceAfter` bu yüzden gerçekten bu hareketten
  // sonraki bakiye.
  let updated: { stock: number };
  try {
    updated = await tx.productVariant.update({
      where: { id: input.variantId },
      data: { stock: { increment: delta } },
      select: { stock: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      throw new BusinessError("VARIANT_NOT_FOUND", "Ürün varyantı bulunamadı", {
        variantId: input.variantId,
      });
    }
    throw e;
  }

  // Kırılım toplamdan önce kontrol ediliyor: ikisi birden yetersizse okunması
  // gereken hata deponunki. "Depoda yeterli mal yok" nereye bakılacağını
  // söyler, "stok eksiye düşerdi" söylemez.
  if (input.warehouseId) {
    await moveWarehouseRow(tx, {
      variantId: input.variantId,
      warehouseId: input.warehouseId,
      delta,
      allowNegative: input.allowNegativeWarehouse ?? input.allowNegative ?? false,
      fromErp: input.source === "ERP",
    });
  }

  if (updated.stock < 0 && !input.allowNegative) {
    // Fırlatmak işlemi geri alır: artırım da, varsa kırılım da geri sarılır.
    throw new BusinessError(
      "INVALID_STOCK",
      `Stok eksiye düşerdi (${updated.stock} adet)`,
      { variantId: input.variantId, balance: updated.stock },
    );
  }

  const movement = await tx.stockMovement.create({
    data: {
      variant: { connect: { id: input.variantId } },
      ...(input.warehouseId
        ? { warehouse: { connect: { id: input.warehouseId } } }
        : {}),
      direction: input.direction,
      quantity,
      source: input.source,
      balanceAfter: updated.stock,
      description: input.description ?? null,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      ...(input.orderId ? { order: { connect: { id: input.orderId } } } : {}),
      ...(input.reversalOfId
        ? { reversalOf: { connect: { id: input.reversalOfId } } }
        : {}),
      ...(input.recordedById
        ? { recordedBy: { connect: { id: input.recordedById } } }
        : {}),
    },
    select: { id: true },
  });

  return {
    id: movement.id,
    variantId: input.variantId,
    direction: input.direction,
    quantity,
    balance: updated.stock,
  };
}

/** Depo kırılımını oynat. Satır yoksa açılır — ilk hareket depoyu da tanımlar. */
async function moveWarehouseRow(
  tx: Tx,
  params: {
    variantId: string;
    warehouseId: string;
    delta: number;
    allowNegative: boolean;
    fromErp: boolean;
  },
): Promise<void> {
  const warehouse = await tx.warehouse.findUnique({
    where: { id: params.warehouseId },
    select: { id: true },
  });
  if (!warehouse) {
    throw new BusinessError("WAREHOUSE_NOT_FOUND", "Depo bulunamadı", {
      warehouseId: params.warehouseId,
    });
  }

  const row = await tx.variantStock.upsert({
    where: {
      variantId_warehouseId: {
        variantId: params.variantId,
        warehouseId: params.warehouseId,
      },
    },
    create: {
      variantId: params.variantId,
      warehouseId: params.warehouseId,
      onHand: params.delta,
      ...(params.fromErp ? { erpSyncedAt: new Date() } : {}),
    },
    update: {
      onHand: { increment: params.delta },
      ...(params.fromErp ? { erpSyncedAt: new Date() } : {}),
    },
    select: { onHand: true },
  });

  if (row.onHand < 0 && !params.allowNegative) {
    throw new BusinessError(
      "INVALID_STOCK",
      `Depoda yeterli mal yok (${row.onHand} adet)`,
      { warehouseId: params.warehouseId, onHand: row.onHand },
    );
  }
}

// ─────────────────────────────────────────────
// SİPARİŞ
// ─────────────────────────────────────────────

export interface OrderStockLine {
  variantId: string;
  quantity: number;
}

/**
 * Siparişin tuttuğu malı defterden düş.
 *
 * Sipariş *oluşturulduğunda* düşer, sevk edildiğinde değil: satılabilir adet
 * bu sistemde "sipariş edilmemiş olan"dır, yoksa aynı son kutu iki müşteriye
 * birden satılırdı.
 */
export async function recordOrderStockOut(
  tx: Tx,
  ctx: {
    orderId: string;
    orderNumber: string;
    lines: readonly OrderStockLine[];
    actorId?: string | null;
  },
): Promise<void> {
  for (const line of ctx.lines) {
    await postStockMovement(tx, {
      variantId: line.variantId,
      direction: "OUT",
      quantity: line.quantity,
      source: "ORDER",
      description: `Sipariş ${ctx.orderNumber}`,
      orderId: ctx.orderId,
      recordedById: ctx.actorId ?? null,
      allowNegative: true,
    });
  }
}

/**
 * İptal/ret: malı geri ver.
 *
 * Siparişin satırlarından okunuyor, defterdeki çıkış hareketlerinden değil —
 * defter bu adım eklenmeden önce oluşmuş siparişler için boş, ve o siparişlerin
 * iptali de malı geri vermeye devam etmek zorunda.
 */
export async function recordOrderStockReturn(
  tx: Tx,
  ctx: {
    orderId: string;
    orderNumber: string;
    reason: "CANCELLED" | "REJECTED";
    actorId?: string | null;
  },
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId: ctx.orderId },
    select: { variantId: true, quantity: true },
  });

  const label = ctx.reason === "CANCELLED" ? "iptali" : "reddi";
  for (const item of items) {
    await postStockMovement(tx, {
      variantId: item.variantId,
      direction: "IN",
      quantity: item.quantity,
      source: "ORDER_CANCEL",
      description: `Sipariş ${ctx.orderNumber} ${label}`,
      orderId: ctx.orderId,
      recordedById: ctx.actorId ?? null,
    });
  }
}

// ─────────────────────────────────────────────
// ELLE, SAYIM, AKTARIM
// ─────────────────────────────────────────────

export interface ManualStockInput {
  variantId: string;
  warehouseId?: string;
  direction: StockDirection;
  quantity: number;
  description: string;
  occurredAt?: string;
}

/** Fire, numune, hurda, bulunan fazla mal: sebebi insanın yazdığı hareket. */
export async function recordManualStockMovement(
  input: ManualStockInput,
  actorId: string,
): Promise<PostedStockMovement> {
  const description = input.description.trim();
  if (!description) {
    throw new BusinessError("INVALID_STOCK", "Açıklama zorunludur");
  }

  return prisma.$transaction((tx) =>
    postStockMovement(tx, {
      variantId: input.variantId,
      warehouseId: input.warehouseId ?? null,
      direction: input.direction,
      quantity: input.quantity,
      source: "MANUAL",
      description,
      occurredAt: parseOccurredAt(input.occurredAt),
      recordedById: actorId,
    }),
  );
}

export interface StockCountInput {
  variantId: string;
  warehouseId?: string;
  /** Sayılan adet — fark değil. */
  counted: number;
  description?: string;
  occurredAt?: string;
}

export interface StockCountResult {
  /** Fark sıfırsa hareket yazılmaz; defter "değişmedi" satırıyla şişmemeli. */
  movement: PostedStockMovement | null;
  previous: number;
  counted: number;
  difference: number;
}

/**
 * Sayım: sayılan adedi yaz, farkı defter hesaplasın.
 *
 * Fark tek bir hareket olarak giriyor, "sıfırla + yeniden yükle" iki hareketi
 * olarak değil: sayımın anlamı, defterin kaç adet yanıldığıdır ve o sayı tek
 * satırda okunabilmeli.
 */
export async function recordStockCount(
  input: StockCountInput,
  actorId: string,
): Promise<StockCountResult> {
  const counted = Math.trunc(input.counted);
  if (!Number.isFinite(counted) || counted < 0) {
    throw new BusinessError("INVALID_STOCK", "Sayılan adet negatif olamaz");
  }

  return prisma.$transaction(async (tx) => {
    const previous = await currentQuantity(tx, input.variantId, input.warehouseId);
    const difference = counted - previous;

    if (difference === 0) {
      return { movement: null, previous, counted, difference };
    }

    const note = input.description?.trim();
    const movement = await postStockMovement(tx, {
      variantId: input.variantId,
      warehouseId: input.warehouseId ?? null,
      direction: difference > 0 ? "IN" : "OUT",
      quantity: Math.abs(difference),
      source: "COUNT",
      description: note || `Sayım: ${previous} → ${counted}`,
      occurredAt: parseOccurredAt(input.occurredAt),
      recordedById: actorId,
    });

    return { movement, previous, counted, difference };
  });
}

/** Sayımın karşılaştıracağı sayı: depo verilmişse o deponun adedi, yoksa toplam. */
async function currentQuantity(
  tx: Tx,
  variantId: string,
  warehouseId?: string | null,
): Promise<number> {
  if (warehouseId) {
    const row = await tx.variantStock.findUnique({
      where: { variantId_warehouseId: { variantId, warehouseId } },
      select: { onHand: true },
    });
    return row?.onHand ?? 0;
  }
  const variant = await tx.productVariant.findUnique({
    where: { id: variantId },
    select: { stock: true },
  });
  if (!variant) {
    throw new BusinessError("VARIANT_NOT_FOUND", "Ürün varyantı bulunamadı", {
      variantId,
    });
  }
  return variant.stock;
}

export interface StockTransferInput {
  variantId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  description?: string;
  occurredAt?: string;
}

export interface StockTransferResult {
  outMovementId: string;
  inMovementId: string;
  quantity: number;
}

/**
 * Depodan depoya taşı.
 *
 * İki hareket, birbirine bağlı — kasadaki virmanla aynı gerekçe: tek bir
 * "aktarım" satırı, her depo ekstresini "bu satır bana göre eksi mi artı mı"
 * sorusunu çözmek zorunda bırakırdı. Toplam değişmediği için iki bacak
 * birbirini götürür; kırılım değişir.
 */
export async function transferStock(
  input: StockTransferInput,
  actorId: string,
): Promise<StockTransferResult> {
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw new BusinessError("INVALID_STOCK", "Aynı depoya aktarım yapılamaz");
  }
  const occurredAt = parseOccurredAt(input.occurredAt);

  return prisma.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.warehouse.findUnique({
        where: { id: input.fromWarehouseId },
        select: { name: true },
      }),
      tx.warehouse.findUnique({
        where: { id: input.toWarehouseId },
        select: { name: true },
      }),
    ]);
    if (!from || !to) {
      throw new BusinessError("WAREHOUSE_NOT_FOUND", "Depo bulunamadı");
    }

    const note = input.description?.trim();
    const out = await postStockMovement(tx, {
      variantId: input.variantId,
      warehouseId: input.fromWarehouseId,
      direction: "OUT",
      quantity: input.quantity,
      source: "TRANSFER",
      description: note || `${to.name} deposuna aktarım`,
      occurredAt,
      recordedById: actorId,
      // Toplam iki bacağın sonunda değişmiyor; kısıt kaynak deponun adedi.
      allowNegative: true,
      allowNegativeWarehouse: false,
    });
    const into = await postStockMovement(tx, {
      variantId: input.variantId,
      warehouseId: input.toWarehouseId,
      direction: "IN",
      quantity: input.quantity,
      source: "TRANSFER",
      description: note || `${from.name} deposundan aktarım`,
      occurredAt,
      recordedById: actorId,
    });

    // Bağ ikisi de var olduktan sonra kuruluyor: ilki yazılırken karşı bacak
    // henüz yok.
    await tx.stockMovement.update({
      where: { id: into.id },
      data: { counterpart: { connect: { id: out.id } } },
    });

    return {
      outMovementId: out.id,
      inMovementId: into.id,
      quantity: out.quantity,
    };
  });
}

// ─────────────────────────────────────────────
// ERP SENKRONU
// ─────────────────────────────────────────────

export interface ErpStockSyncResult {
  /** Fark sıfırsa hiçbir şey yazılmaz — gecelik senkron defteri şişirmemeli. */
  movement: PostedStockMovement | null;
  previous: number;
  difference: number;
}

/**
 * ERP'nin bildirdiği adede çek — üstüne yazarak değil, farkı kadar hareket
 * yazarak.
 *
 * Fark bu deftere ait en önemli satır: "gece ERP 40 adet düştü" bilgisi
 * olmadan, sabah stoku eksilmiş bulan kişi kimin düşürdüğünü hiçbir zaman
 * öğrenemiyordu. Üstelik fark görünür olduğu an, ERP ile B2B'nin ayrıştığı
 * ürünler de kendiliğinden ortaya çıkıyor.
 */
export async function applyErpStock(
  input: {
    variantId: string;
    quantity: number;
    warehouseId?: string | null;
    previous?: number;
  },
  options: { occurredAt?: Date } = {},
): Promise<ErpStockSyncResult> {
  const target = Math.max(0, Math.trunc(input.quantity));

  return prisma.$transaction(async (tx) => {
    const previous =
      input.previous ??
      (await currentQuantity(tx, input.variantId, input.warehouseId ?? null));
    const difference = target - previous;
    if (difference === 0) {
      return { movement: null, previous, difference };
    }

    const movement = await postStockMovement(tx, {
      variantId: input.variantId,
      warehouseId: input.warehouseId ?? null,
      direction: difference > 0 ? "IN" : "OUT",
      quantity: Math.abs(difference),
      source: "ERP",
      description: `ERP senkronu: ${previous} → ${target}`,
      ...(options.occurredAt ? { occurredAt: options.occurredAt } : {}),
      // ERP'nin sayısı bu sistemin sayısından üstün: ERP eksiye düşürüyorsa
      // sebebi ERP'nin işi, ve senkronu reddetmek iki defteri kalıcı olarak
      // ayrıştırırdı.
      allowNegative: true,
    });

    return { movement, previous, difference };
  });
}

// ─────────────────────────────────────────────
// TERS KAYIT
// ─────────────────────────────────────────────

export interface ReverseStockMovementResult {
  reversalId: string;
  quantity: number;
  balance: number;
}

/**
 * Elle yazılmış bir hareketi tersiyle geri al.
 *
 * Sipariş kaynaklı hareketler burada reddediliyor: onların öbür yarısı bir
 * sipariş satırı ve bir cari kayıt: yalnız stok bacağını geri almak, siparişi
 * "malı çıkmamış" gösterirdi. Onlar siparişin kendisi iptal edilerek geri
 * alınır ve o yol iki tarafı birden çözer.
 */
export async function reverseStockMovement(
  params: { movementId: string; reason: string },
  actorId: string,
): Promise<ReverseStockMovementResult> {
  return prisma.$transaction(async (tx) => {
    const original = await tx.stockMovement.findUnique({
      where: { id: params.movementId },
      select: {
        id: true,
        variantId: true,
        warehouseId: true,
        quantity: true,
        direction: true,
        source: true,
        reversalOfId: true,
        counterpartId: true,
        reversedBy: { select: { id: true } },
      },
    });
    if (!original) {
      throw new BusinessError("STOCK_MOVEMENT_NOT_FOUND", "Stok hareketi bulunamadı");
    }
    if (original.source === "ORDER" || original.source === "ORDER_CANCEL") {
      throw new BusinessError(
        "INVALID_STATE",
        "Sipariş kaynaklı hareket buradan iptal edilemez — siparişi iptal edin",
      );
    }
    if (original.reversalOfId) {
      throw new BusinessError("INVALID_STATE", "Bu kayıt zaten bir iptal kaydı");
    }
    if (original.reversedBy) {
      throw new BusinessError("INVALID_STATE", "Bu hareket zaten iptal edilmiş");
    }

    const reversal = await postStockMovement(tx, {
      variantId: original.variantId,
      warehouseId: original.warehouseId,
      direction: original.direction === "IN" ? "OUT" : "IN",
      quantity: original.quantity,
      source: original.source,
      description: `İptal: ${params.reason}`,
      reversalOfId: original.id,
      recordedById: actorId,
    });

    // Aktarım tek olaydır, iki satırdır; bir bacağını geri almak öbür depoda
    // olmayan mal yaratırdı.
    const otherLegId = original.counterpartId ?? (await counterpartOf(tx, original.id));
    if (otherLegId) {
      const other = await tx.stockMovement.findUnique({
        where: { id: otherLegId },
        select: {
          id: true,
          variantId: true,
          warehouseId: true,
          quantity: true,
          direction: true,
          source: true,
          reversedBy: { select: { id: true } },
        },
      });
      if (other && !other.reversedBy) {
        await postStockMovement(tx, {
          variantId: other.variantId,
          warehouseId: other.warehouseId,
          direction: other.direction === "IN" ? "OUT" : "IN",
          quantity: other.quantity,
          source: other.source,
          description: `İptal: ${params.reason}`,
          reversalOfId: other.id,
          recordedById: actorId,
        });
      }
    }

    return {
      reversalId: reversal.id,
      quantity: reversal.quantity,
      balance: reversal.balance,
    };
  });
}

/** Bu bacağı gösteren öbür bacak (bağı yalnızca bir taraf tutuyor). */
async function counterpartOf(tx: Tx, movementId: string): Promise<string | null> {
  const row = await tx.stockMovement.findUnique({
    where: { counterpartId: movementId },
    select: { id: true },
  });
  return row?.id ?? null;
}

// ─────────────────────────────────────────────
// DEFTERİ OKUMAK
// ─────────────────────────────────────────────

export interface StockMovementRow {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  warehouseId: string | null;
  warehouseName: string | null;
  direction: StockDirection;
  quantity: number;
  balanceAfter: number;
  source: StockMovementSource;
  description: string | null;
  occurredAt: string;
  orderId: string | null;
  orderNumber: string | null;
  recordedByName: string | null;
  reversedById: string | null;
  reversalOfId: string | null;
}

export interface StockMovementFilter {
  variantId?: string;
  warehouseId?: string;
  source?: StockMovementSource;
  direction?: StockDirection;
  /** SKU / barkod / ürün adı. */
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function listStockMovements(
  filter: StockMovementFilter = {},
): Promise<StockMovementRow[]> {
  const search = filter.q?.trim();
  const rows = await prisma.stockMovement.findMany({
    where: {
      ...(filter.variantId ? { variantId: filter.variantId } : {}),
      ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
      ...(filter.source ? { source: filter.source } : {}),
      ...(filter.direction ? { direction: filter.direction } : {}),
      ...occurredWithin(filter.from, filter.to),
      ...(search
        ? {
            variant: {
              OR: [
                { sku: { contains: search, mode: "insensitive" as const } },
                { barcode: { contains: search, mode: "insensitive" as const } },
                {
                  product: {
                    name: { contains: search, mode: "insensitive" as const },
                  },
                },
              ],
            },
          }
        : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: Math.min(filter.limit ?? 100, 500),
    select: {
      id: true,
      variantId: true,
      variant: { select: { sku: true, product: { select: { name: true } } } },
      warehouseId: true,
      warehouse: { select: { name: true } },
      direction: true,
      quantity: true,
      balanceAfter: true,
      source: true,
      description: true,
      occurredAt: true,
      orderId: true,
      order: { select: { orderNumber: true } },
      recordedBy: { select: { name: true } },
      reversedBy: { select: { id: true } },
      reversalOfId: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    variantId: r.variantId,
    sku: r.variant.sku,
    productName: r.variant.product.name,
    warehouseId: r.warehouseId,
    warehouseName: r.warehouse?.name ?? null,
    direction: r.direction,
    quantity: r.quantity,
    balanceAfter: r.balanceAfter,
    source: r.source,
    description: r.description,
    occurredAt: r.occurredAt.toISOString(),
    orderId: r.orderId,
    orderNumber: r.order?.orderNumber ?? null,
    recordedByName: r.recordedBy?.name ?? null,
    reversedById: r.reversedBy?.id ?? null,
    reversalOfId: r.reversalOfId,
  }));
}

export interface StockSummaryLine {
  source: StockMovementSource;
  in: number;
  out: number;
  net: number;
}

export interface StockSummary {
  from: string;
  to: string;
  totalIn: number;
  totalOut: number;
  net: number;
  bySource: StockSummaryLine[];
}

/**
 * Dönem özeti: ne girdi, ne çıktı, hangi sebeple.
 *
 * Veritabanında gruplanıyor (Adım 18'in dersi). Asıl işi tek bir soruyu
 * cevaplamak: "bu ay stoktan çıkan malın ne kadarı satış, ne kadarı fire".
 */
export async function getStockSummary(range: {
  from?: string;
  to?: string;
}): Promise<StockSummary> {
  const { from, to } = dayRange(range.from, range.to);

  const grouped = await prisma.stockMovement.groupBy({
    by: ["source", "direction"],
    where: { occurredAt: { gte: from, lt: to } },
    _sum: { quantity: true },
  });

  const totals = new Map<StockMovementSource, { in: number; out: number }>();
  for (const row of grouped) {
    const bucket = totals.get(row.source) ?? { in: 0, out: 0 };
    const qty = row._sum.quantity ?? 0;
    if (row.direction === "IN") bucket.in += qty;
    else bucket.out += qty;
    totals.set(row.source, bucket);
  }

  let totalIn = 0;
  let totalOut = 0;
  for (const bucket of totals.values()) {
    totalIn += bucket.in;
    totalOut += bucket.out;
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totalIn,
    totalOut,
    net: totalIn - totalOut,
    bySource: [...totals.entries()].map(([source, b]) => ({
      source,
      in: b.in,
      out: b.out,
      net: b.in - b.out,
    })),
  };
}

function occurredWithin(from?: string, to?: string) {
  if (!from && !to) return {};
  const range = dayRange(from, to);
  return { occurredAt: { gte: range.from, lt: range.to } };
}

/** `to` günün tamamını kapsar: "bugün" raporu bugünü içermek zorunda. */
function dayRange(from?: string, to?: string): { from: Date; to: Date } {
  const start = from ? new Date(from) : startOfToday();
  const endInput = to ? new Date(to) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(endInput.getTime())) {
    throw new BusinessError("INVALID_STOCK", "Geçersiz tarih aralığı");
  }
  const end = new Date(
    endInput.getFullYear(),
    endInput.getMonth(),
    endInput.getDate() + 1,
  );
  return {
    from: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
    to: end,
  };
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseOccurredAt(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BusinessError("INVALID_STOCK", "Geçersiz tarih");
  }
  return d;
}
