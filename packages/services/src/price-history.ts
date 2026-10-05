import { Prisma, prisma } from "@repo/database";

// Fiyat geçmişi (D5, 2026-10-05; Said: "yalnız yönetimde").
//
// Her fiyat yazan yol (elle, toplu, ERP, zamanlı, paket birimi) değişikliği
// buraya bir satır olarak bırakıyor. Tek kapı bu fonksiyon: kaydı yazmayı
// unutan yeni bir yol, geçmişte boşluk demek — o yüzden fiyat yazan her
// servis dosyası bunu çağırıyor ve testi (price-history.test) her yolu tek tek
// deniyor.
//
// Aynı fiyata "değiştirme" yazılmıyor: toplu içe aktarma bin satırın dokuzyüz
// doksanını aynı fiyatla yeniden yazıyor ve geçmiş gürültüye boğuluyordu.

type Client = Prisma.TransactionClient | typeof prisma;

export type PriceChangeSource = "MANUAL" | "BULK" | "ERP" | "SCHEDULE" | "UNIT";

export interface PriceChangeInput {
  variantId: string;
  customerGroupId?: string | null;
  unitId?: string | null;
  minQuantity?: number;
  /** null = fiyat satırı yeni açıldı. */
  oldPrice: Prisma.Decimal | number | string | null;
  /** null = fiyat satırı silindi. */
  newPrice: Prisma.Decimal | number | string | null;
  currency?: string;
  source: PriceChangeSource;
  actorId?: string | null;
}

function toDecimal(
  v: Prisma.Decimal | number | string | null,
): Prisma.Decimal | null {
  return v === null ? null : new Prisma.Decimal(v).toDecimalPlaces(2);
}

/** Bir fiyat değişikliğini geçmişe yazar; fiyat aynıysa hiçbir şey yazmaz. */
export async function recordPriceChange(
  client: Client,
  input: PriceChangeInput,
): Promise<void> {
  const oldPrice = toDecimal(input.oldPrice);
  const newPrice = toDecimal(input.newPrice);
  if (oldPrice && newPrice && oldPrice.eq(newPrice)) return;
  if (!oldPrice && !newPrice) return;

  // Ad, kimlik değil: grup silinse ya da yeniden adlansa da geçmiş okunur
  // kalmalı.
  const [group, unit] = await Promise.all([
    input.customerGroupId
      ? client.customerGroup.findUnique({
          where: { id: input.customerGroupId },
          select: { name: true },
        })
      : null,
    input.unitId
      ? client.variantUnit.findUnique({
          where: { id: input.unitId },
          select: { name: true },
        })
      : null,
  ]);

  await client.priceHistory.create({
    data: {
      variantId: input.variantId,
      groupName: group?.name ?? null,
      unitName: unit?.name ?? null,
      minQuantity: input.minQuantity ?? 1,
      oldPrice,
      newPrice,
      currency: input.currency ?? "TRY",
      source: input.source,
      changedById: input.actorId ?? null,
    },
  });
}

export interface PriceHistoryRow {
  id: string;
  sku: string;
  groupName: string | null;
  unitName: string | null;
  minQuantity: number;
  oldPrice: string | null;
  newPrice: string | null;
  currency: string;
  source: PriceChangeSource;
  changedByName: string | null;
  createdAt: string;
}

/** Ürünün bütün varyantlarının fiyat geçmişi, en yenisi önce. */
export async function listProductPriceHistory(
  productId: string,
  limit = 50,
): Promise<PriceHistoryRow[]> {
  const rows = await prisma.priceHistory.findMany({
    where: { variant: { productId } },
    select: {
      id: true,
      groupName: true,
      unitName: true,
      minQuantity: true,
      oldPrice: true,
      newPrice: true,
      currency: true,
      source: true,
      createdAt: true,
      variant: { select: { sku: true } },
      changedBy: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.map((r) => ({
    id: r.id,
    sku: r.variant.sku,
    groupName: r.groupName,
    unitName: r.unitName,
    minQuantity: r.minQuantity,
    oldPrice: r.oldPrice?.toFixed(2) ?? null,
    newPrice: r.newPrice?.toFixed(2) ?? null,
    currency: r.currency,
    source: r.source,
    changedByName: r.changedBy?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
