import { Prisma, prisma } from "@repo/database";
import type { UpsertVariantUnitInput } from "@repo/types";
import { BusinessError } from "./errors";
import { round2 } from "./money";
import { recordPriceChange } from "./price-history";
import { packageCount, qty, type QuantityLike } from "./quantity";

// Paket birimleri (F2 çoklu birim): koli, palet, çuval.
//
// Kalem stoğunu taban biriminde tutar (`ProductVariant.unit`, ADET/KG). Paket
// birimi yalnızca üç şey ekler: "kaç taban birim eder" çarpanı, kendi barkodu
// ve isteğe bağlı kendi fiyatı. Sipariş satırı miktarı yine taban birimde
// saklar, paket adı ve çarpanı künye olarak donar — bkz. `VariantUnit`
// şema notu.
//
// Paket fiyatı burada yalnızca **liste fiyatı** olarak (grupsuz, ilk kademe)
// düzenlenir. Gruba özel paket fiyatı ERP köprüsünden gelir; fiyat çözümü
// (`resolvePrice`) ikisini de okur.

/**
 * Belge satırının paket künyesi: "2 KOLİ × 100,00 ₺ (24 ADET)".
 *
 * Miktar her zaman taban birimde; `count` paket sayısıdır ve kısmi sevkte
 * kesirli çıkabilir (24 adetlik satırın 6'sı = 0,5 koli) — ekran tam değilse
 * yalnızca taban birimi basar.
 */
export interface LineUnitView {
  name: string;
  factor: number;
  count: number;
  /** Paket başına fiyat (birim fiyat × çarpan); fiyatsız belgede null. */
  unitPrice: string | null;
}

export function lineUnitView(row: {
  quantity: QuantityLike;
  unitName: string | null;
  unitMultiplier: Prisma.Decimal | null;
  unitPrice?: Prisma.Decimal | null;
}): LineUnitView | null {
  if (!row.unitName || !row.unitMultiplier || row.unitMultiplier.lte(0)) return null;
  return {
    name: row.unitName,
    factor: qty(row.unitMultiplier),
    count: packageCount(row.quantity, row.unitMultiplier),
    unitPrice: row.unitPrice ? round2(row.unitPrice.mul(row.unitMultiplier)).toFixed(2) : null,
  };
}

export interface AdminVariantUnit {
  id: string;
  name: string;
  factor: number;
  barcode: string | null;
  externalCode: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Paketin liste fiyatı (grupsuz, ilk kademe); yoksa null = taban × çarpan. */
  price: string | null;
  /** Bu birimle verilmiş sipariş satırı sayısı — silmeden önce gösterilir. */
  orderItemCount: number;
}

export const VARIANT_UNIT_SELECT = {
  id: true,
  name: true,
  factor: true,
  barcode: true,
  externalCode: true,
  isActive: true,
  sortOrder: true,
  prices: {
    where: { customerGroupId: null, minQuantity: 1 },
    select: { price: true },
  },
  _count: { select: { orderItems: true } },
} satisfies Prisma.VariantUnitSelect;

type UnitRow = Prisma.VariantUnitGetPayload<{ select: typeof VARIANT_UNIT_SELECT }>;

export function toVariantUnitView(u: UnitRow): AdminVariantUnit {
  return {
    id: u.id,
    name: u.name,
    factor: qty(u.factor),
    barcode: u.barcode,
    externalCode: u.externalCode,
    isActive: u.isActive,
    sortOrder: u.sortOrder,
    price: u.prices[0]?.price.toFixed(2) ?? null,
    orderItemCount: u._count.orderItems,
  };
}

/** Birim adı belgede ve ekranda büyük harfle durur: "koli" → "KOLİ". */
function normalizeName(name: string): string {
  return name.trim().toLocaleUpperCase("tr");
}

/**
 * Barkod kalemler ve paketler arasında tekil olmalı: okutulan kod tek bir
 * kaleme ve tek bir birime çıkmalı. İki tablo ayrı olduğu için veritabanı bunu
 * tek indeksle tutamıyor; her yazma burada denetlenir.
 */
export async function assertBarcodeFree(
  barcode: string,
  except: { variantId?: string; unitId?: string } = {},
): Promise<void> {
  const [variant, unit] = await Promise.all([
    prisma.productVariant.findUnique({ where: { barcode }, select: { id: true } }),
    prisma.variantUnit.findUnique({ where: { barcode }, select: { id: true } }),
  ]);
  const taken =
    (variant && variant.id !== except.variantId) || (unit && unit.id !== except.unitId);
  if (taken) {
    throw new BusinessError("DUPLICATE_BARCODE", `"${barcode}" barkodu zaten kullanılıyor`);
  }
}

export interface BarcodeHit {
  variantId: string;
  /** Paket barkoduysa birim; kalemin kendi barkoduysa null. */
  unitId: string | null;
}

/** Okutulan barkodun karşılığı: kalem mi, paket mi. */
export async function findByBarcode(barcode: string): Promise<BarcodeHit | null> {
  const code = barcode.trim();
  if (!code) return null;
  const variant = await prisma.productVariant.findUnique({
    where: { barcode: code },
    select: { id: true },
  });
  if (variant) return { variantId: variant.id, unitId: null };
  const unit = await prisma.variantUnit.findUnique({
    where: { barcode: code },
    select: { id: true, variantId: true },
  });
  return unit ? { variantId: unit.variantId, unitId: unit.id } : null;
}

export async function listVariantUnits(variantId: string): Promise<AdminVariantUnit[]> {
  const rows = await prisma.variantUnit.findMany({
    where: { variantId },
    select: VARIANT_UNIT_SELECT,
    orderBy: [{ factor: "asc" }, { sortOrder: "asc" }],
  });
  return rows.map(toVariantUnitView);
}

async function assertNameFree(variantId: string, name: string, exceptId?: string) {
  const found = await prisma.variantUnit.findUnique({
    where: { variantId_name: { variantId, name } },
    select: { id: true },
  });
  if (found && found.id !== exceptId) {
    throw new BusinessError("DUPLICATE_UNIT", `Bu kalemde "${name}" birimi zaten var`);
  }
}

/**
 * Paketin liste fiyatını yaz ya da kaldır. null → satır silinir ve paket
 * yeniden taban fiyat × çarpandan fiyatlanır.
 */
async function setListPrice(
  tx: Prisma.TransactionClient,
  variantId: string,
  unitId: string,
  price: number | null,
  actorId: string | null,
): Promise<void> {
  const existing = await tx.price.findFirst({
    where: { variantId, unitId, customerGroupId: null, minQuantity: 1 },
    select: { id: true, price: true },
  });
  const amount = price === null ? null : round2(new Prisma.Decimal(price));
  await recordPriceChange(tx, {
    variantId,
    unitId,
    oldPrice: existing?.price ?? null,
    newPrice: amount,
    source: "UNIT",
    actorId,
  });
  if (amount === null) {
    if (existing) await tx.price.delete({ where: { id: existing.id } });
    return;
  }
  if (existing) {
    await tx.price.update({ where: { id: existing.id }, data: { price: amount } });
  } else {
    await tx.price.create({
      data: { variantId, unitId, customerGroupId: null, minQuantity: 1, price: amount },
    });
  }
}

export async function createVariantUnit(
  variantId: string,
  input: UpsertVariantUnitInput,
  actorId: string | null = null,
): Promise<AdminVariantUnit> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true },
  });
  if (!variant) throw new BusinessError("VARIANT_NOT_FOUND", "Varyant bulunamadı");

  const name = normalizeName(input.name);
  await assertNameFree(variantId, name);
  if (input.barcode) await assertBarcodeFree(input.barcode);

  const id = await prisma.$transaction(async (tx) => {
    const unit = await tx.variantUnit.create({
      data: {
        variantId,
        name,
        factor: input.factor,
        barcode: input.barcode || null,
        externalCode: input.externalCode || null,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
      select: { id: true },
    });
    if (input.price !== undefined) {
      await setListPrice(tx, variantId, unit.id, input.price, actorId);
    }
    return unit.id;
  });
  return toVariantUnitView(await prisma.variantUnit.findUniqueOrThrow({ where: { id }, select: VARIANT_UNIT_SELECT }));
}

export async function updateVariantUnit(
  id: string,
  input: Partial<UpsertVariantUnitInput>,
  actorId: string | null = null,
): Promise<AdminVariantUnit> {
  const current = await prisma.variantUnit.findUnique({
    where: { id },
    select: { id: true, variantId: true },
  });
  if (!current) throw new BusinessError("UNIT_NOT_FOUND", "Birim bulunamadı");

  const name = input.name !== undefined ? normalizeName(input.name) : undefined;
  if (name !== undefined) await assertNameFree(current.variantId, name, id);
  if (input.barcode) await assertBarcodeFree(input.barcode, { unitId: id });

  await prisma.$transaction(async (tx) => {
    await tx.variantUnit.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        // Çarpan değişse de geçmiş siparişin "2 koli × 12" künyesi değişmez:
        // satır çarpanı kendi kolonunda donmuş taşıyor.
        ...(input.factor !== undefined ? { factor: input.factor } : {}),
        ...(input.barcode !== undefined ? { barcode: input.barcode || null } : {}),
        ...(input.externalCode !== undefined
          ? { externalCode: input.externalCode || null }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    if (input.price !== undefined) {
      await setListPrice(tx, current.variantId, id, input.price, actorId);
    }
  });
  return toVariantUnitView(await prisma.variantUnit.findUniqueOrThrow({ where: { id }, select: VARIANT_UNIT_SELECT }));
}

/**
 * Birimi sil. Geçmiş siparişler etkilenmez: satır paket adını ve çarpanını
 * kendi kolonunda taşır, bağ boşa düşer. Paketin fiyat satırları birimle
 * birlikte gider; sepette bu birimle duran satır taban birime döner.
 */
export async function deleteVariantUnit(id: string): Promise<void> {
  const found = await prisma.variantUnit.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw new BusinessError("UNIT_NOT_FOUND", "Birim bulunamadı");
  await prisma.variantUnit.delete({ where: { id } });
}
