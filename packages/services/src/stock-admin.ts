import { Prisma, prisma } from "@repo/database";
import { BusinessError } from "./errors";

// Depo ve stok kırılımı.
//
// `ProductVariant.stock` toplam eldeki adet olarak kalıyor; buradaki satırlar
// onun depo kırılımı. İkisi ayrı çünkü katalog listesi tek satırda "var mı"
// sorusunu cevaplayabilmeli, sevkiyat ekranı ise "hangi depoda" bilmek zorunda.
// Toplam, kırılım her değiştiğinde yeniden yazılıyor — iki sayının ayrışması
// "stokta var" deyip sevk edememe demek.

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
    onHand: r.onHand,
    reserved: r.reserved,
    available: Math.max(0, r.onHand - r.reserved),
    erpSyncedAt: r.erpSyncedAt?.toISOString() ?? null,
  }));
}

/**
 * Bir varyantın bir depodaki miktarını yaz ve toplamı tazele.
 *
 * ERP köprüsü de, elle düzeltme de buradan geçer: toplamı güncelleme adımı tek
 * bir yerde kalsın diye. Çağıranın toplamı ayrıca yazmasına gerek yok — zaten
 * yazmamalı.
 */
export async function setVariantStock(input: {
  variantId: string;
  warehouseCode: string;
  onHand: number;
  reserved?: number;
  fromErp?: boolean;
}): Promise<void> {
  if (input.onHand < 0) {
    throw new BusinessError("INVALID_STOCK", "Stok negatif olamaz");
  }

  await prisma.$transaction(async (tx) => {
    const warehouse = await tx.warehouse.findUnique({
      where: { code: input.warehouseCode },
      select: { id: true },
    });
    if (!warehouse) {
      throw new BusinessError("WAREHOUSE_NOT_FOUND", "Depo bulunamadı", {
        code: input.warehouseCode,
      });
    }

    await tx.variantStock.upsert({
      where: {
        variantId_warehouseId: {
          variantId: input.variantId,
          warehouseId: warehouse.id,
        },
      },
      create: {
        variantId: input.variantId,
        warehouseId: warehouse.id,
        onHand: input.onHand,
        reserved: input.reserved ?? 0,
        erpSyncedAt: input.fromErp ? new Date() : null,
      },
      update: {
        onHand: input.onHand,
        ...(input.reserved !== undefined ? { reserved: input.reserved } : {}),
        ...(input.fromErp ? { erpSyncedAt: new Date() } : {}),
      },
    });

    await refreshVariantTotal(tx, input.variantId);
  });
}

/** Kırılımın toplamını varyanta yazar. Tek yer: iki sayı ayrışmasın. */
async function refreshVariantTotal(
  tx: Prisma.TransactionClient,
  variantId: string,
): Promise<void> {
  const agg = await tx.variantStock.aggregate({
    _sum: { onHand: true },
    where: { variantId },
  });
  await tx.productVariant.update({
    where: { id: variantId },
    data: { stock: agg._sum.onHand ?? 0 },
  });
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
      stock: number;
      minStock: number;
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
    stock: r.stock,
    minStock: r.minStock,
    unit: r.unit,
  }));
}
