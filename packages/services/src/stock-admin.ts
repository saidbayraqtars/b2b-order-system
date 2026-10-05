import { prisma, type Prisma } from "@repo/database";
import { BusinessError } from "./errors";
import { qty, qtyOrNull, qtySub } from "./quantity";
import { applyErpStock, recordStockCount } from "./stock-ledger";

// Depo ve stok kırılımı.
//
// `ProductVariant.stock` toplam eldeki adet olarak kalıyor; buradaki satırlar
// onun depo kırılımı. İkisi ayrı çünkü katalog listesi tek satırda "var mı"
// sorusunu cevaplayabilmeli, sevkiyat ekranı ise "hangi depoda" bilmek zorunda.
//
// Toplamı burası artık *yeniden hesaplamıyor*: adedi değiştiren her şey
// [stock-ledger] üzerinden geçiyor ve iki sayı da aynı farkla oynuyor. Eski
// "kırılımın toplamını varyanta yaz" adımı, depo bilmeyen sipariş düşüşlerini
// ilk senkronda siliyordu.

export interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
}

export async function listWarehouses(): Promise<WarehouseRow[]> {
  return prisma.warehouse.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, code: true, name: true, isDefault: true, isActive: true },
  });
}

export async function upsertWarehouse(input: {
  code: string;
  name: string;
  isDefault?: boolean;
  isActive?: boolean;
}): Promise<WarehouseRow> {
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.warehouse.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.warehouse.upsert({
      where: { code: input.code },
      create: {
        code: input.code,
        name: input.name,
        isDefault: input.isDefault ?? false,
        isActive: input.isActive ?? true,
      },
      update: {
        name: input.name,
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: { id: true, code: true, name: true, isDefault: true, isActive: true },
    });
  });
}

export interface VariantStockRow {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  /** Satılabilir = eldeki − rezerve. Negatife düşmez; eksi stok bir veri hatası. */
  available: number;
  erpSyncedAt: string | null;
}

export async function getVariantStock(
  variantId: string,
): Promise<VariantStockRow[]> {
  const rows = await prisma.variantStock.findMany({
    where: { variantId },
    orderBy: { warehouse: { name: "asc" } },
    select: {
      warehouseId: true,
      onHand: true,
      reserved: true,
      erpSyncedAt: true,
      warehouse: { select: { code: true, name: true } },
    },
  });

  return rows.map((r) => ({
    warehouseId: r.warehouseId,
    warehouseCode: r.warehouse.code,
    warehouseName: r.warehouse.name,
    onHand: qty(r.onHand),
    reserved: qty(r.reserved),
    available: Math.max(0, qtySub(r.onHand, r.reserved)),
    erpSyncedAt: r.erpSyncedAt?.toISOString() ?? null,
  }));
}

/**
 * Bir varyantın bir depodaki miktarını istenen sayıya çek.
 *
 * "Şu an 40 adet" diyen her çağrı — ERP köprüsü de, elle düzeltme de — buradan
 * geçer, ve **fark kadar bir defter hareketi** olarak uygulanır. Üstüne yazmak
 * yerine fark yazmanın sebebi: 40'a çekilen bir sayının kaç adet oynadığı,
 * "stok neden düştü" sorusunun tek cevabı.
 *
 * `reserved` defterin dışında kalıyor: rezerve edilen mal hâlâ depoda duruyor,
 * eldeki adedi değiştirmiyor.
 */
export async function setVariantStock(input: {
  variantId: string;
  warehouseCode: string;
  onHand: number;
  reserved?: number;
  fromErp?: boolean;
  /** Elle düzeltmeyi kimin yaptığı; ERP yolunda boş. */
  actorId?: string;
}): Promise<void> {
  if (input.onHand < 0) {
    throw new BusinessError("INVALID_STOCK", "Stok negatif olamaz");
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { code: input.warehouseCode },
    select: { id: true },
  });
  if (!warehouse) {
    throw new BusinessError("WAREHOUSE_NOT_FOUND", "Depo bulunamadı", {
      code: input.warehouseCode,
    });
  }

  if (input.reserved !== undefined) {
    await prisma.variantStock.upsert({
      where: {
        variantId_warehouseId: {
          variantId: input.variantId,
          warehouseId: warehouse.id,
        },
      },
      create: {
        variantId: input.variantId,
        warehouseId: warehouse.id,
        onHand: 0,
        reserved: input.reserved,
      },
      update: { reserved: input.reserved },
    });
  }

  if (input.fromErp) {
    await applyErpStock({
      variantId: input.variantId,
      quantity: input.onHand,
      warehouseId: warehouse.id,
    });
    return;
  }

  await recordStockCount(
    {
      variantId: input.variantId,
      warehouseId: warehouse.id,
      counted: input.onHand,
      description: "Depo miktarı düzeltmesi",
    },
    input.actorId ?? "",
  );
}

export interface StockLevelRow {
  variantId: string;
  sku: string;
  barcode: string | null;
  productName: string;
  /** Toplam eldeki adet — defterin bakiyesi. */
  stock: number;
  minStock: number | null;
  unit: string | null;
  /** Miktarın kaç ondalık alabildiği — sayım ve hareket formunun adımı. */
  quantityScale: number;
  shelfCode: string | null;
  /** Depo süzgeci verildiyse o deponun adedi; verilmediyse null. */
  warehouseOnHand: number | null;
  /** Depo süzgeci verildiyse o depodaki kritik seviye. */
  warehouseMinStock: number | null;
  /** Depo süzgeci verildiyse: bu depodan "sipariş alınmasın" mı. */
  warehouseBlocked: boolean;
  erpSyncedAt: string | null;
}

export interface StockLevelFilter {
  /** SKU / barkod / ürün adı. */
  q?: string;
  warehouseId?: string;
  /**
   * Yalnızca kritik eşiğin altındakiler. Depo verildiyse **o deponun** eşiği
   * ve adedi, verilmediyse varyantın toplam eşiği.
   */
  lowOnly?: boolean;
  limit?: number;
}

/**
 * "Hangi üründe kaç adet var" — ekranın ana tablosu ve aynı zamanda hareket
 * girerken kullanılan ürün seçicisi.
 *
 * İkisi tek uçtan geliyor çünkü sayım girerken sorulan soru zaten "defterde kaç
 * yazıyor": ayrı bir seçici, o sayıyı görmeden ürün seçtirirdi.
 */
export async function listStockLevels(
  filter: StockLevelFilter = {},
): Promise<StockLevelRow[]> {
  const search = filter.q?.trim();
  const rows = await prisma.productVariant.findMany({
    where: {
      isActive: true,
      ...(search
        ? {
            OR: [
              { sku: { contains: search, mode: "insensitive" as const } },
              { barcode: { contains: search, mode: "insensitive" as const } },
              {
                product: { name: { contains: search, mode: "insensitive" as const } },
              },
            ],
          }
        : {}),
      ...(filter.lowOnly
        ? filter.warehouseId
          ? {
              stocks: {
                some: {
                  warehouseId: filter.warehouseId,
                  minStock: { not: null },
                },
              },
            }
          : { minStock: { not: null } }
        : {}),
    },
    orderBy: [{ product: { name: "asc" } }, { sku: "asc" }],
    take: Math.min(filter.limit ?? 100, 500),
    select: {
      id: true,
      sku: true,
      barcode: true,
      stock: true,
      minStock: true,
      unit: true,
      quantityScale: true,
      shelfCode: true,
      erpSyncedAt: true,
      product: { select: { name: true } },
      ...(filter.warehouseId
        ? {
            stocks: {
              where: { warehouseId: filter.warehouseId },
              select: { onHand: true, minStock: true, blockOrders: true },
            },
          }
        : {}),
    },
  });

  type WarehouseCell = {
    onHand: Prisma.Decimal;
    minStock: Prisma.Decimal | null;
    blockOrders: boolean;
  };
  return (
    rows
      .map((r) => {
        const cell = filter.warehouseId
          ? ((r as { stocks?: WarehouseCell[] }).stocks?.[0] ?? null)
          : null;
        return {
          variantId: r.id,
          sku: r.sku,
          barcode: r.barcode,
          productName: r.product.name,
          stock: qty(r.stock),
          minStock: qtyOrNull(r.minStock),
          unit: r.unit,
          quantityScale: r.quantityScale,
          shelfCode: r.shelfCode,
          warehouseOnHand: filter.warehouseId ? qty(cell?.onHand) : null,
          warehouseMinStock: qtyOrNull(cell?.minStock),
          warehouseBlocked: cell?.blockOrders ?? false,
          erpSyncedAt: r.erpSyncedAt?.toISOString() ?? null,
        };
      })
      // Eşiğin altında olma koşulu SQL'de kolonlar arası karşılaştırma isterdi;
      // liste zaten eşiği olanlarla sınırlandığı için burada eleniyor.
      .filter((r) => {
        if (!filter.lowOnly) return true;
        if (filter.warehouseId) {
          return (
            r.warehouseMinStock !== null &&
            (r.warehouseOnHand ?? 0) <= r.warehouseMinStock
          );
        }
        return r.minStock !== null && r.stock <= r.minStock;
      })
  );
}

/**
 * Kritik stokun altına düşen satırlar.
 *
 * Eşiği olmayan varyant listeye girmez: "0 eşikli her ürün uyarıda" bir
 * uyarı listesi değil, ürün listesidir.
 */
export async function listLowStock(limit = 100): Promise<
  Array<{
    variantId: string;
    sku: string;
    productName: string;
    stock: number;
    minStock: number;
    unit: string | null;
  }>
> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      sku: string;
      name: string;
      // `numeric` kolon ham sorgudan Decimal olarak döner, sayı değil.
      stock: Prisma.Decimal;
      minStock: Prisma.Decimal;
      unit: string | null;
    }>
  >`
    SELECT v."id", v."sku", p."name", v."stock", v."minStock", v."unit"
    FROM "ProductVariant" v
    JOIN "Product" p ON p."id" = v."productId"
    WHERE v."minStock" IS NOT NULL
      AND v."isActive" = true
      AND v."stock" <= v."minStock"
    ORDER BY (v."stock" - v."minStock") ASC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    variantId: r.id,
    sku: r.sku,
    productName: r.name,
    stock: qty(r.stock),
    minStock: qty(r.minStock),
    unit: r.unit,
  }));
}
