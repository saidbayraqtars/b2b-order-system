import { prisma } from "@repo/database";
import type { SetCartInput, UpsertCartItemInput } from "@repo/types";
import { loadCompanyPricingContext } from "./catalog";
import { availabilityOf, loadWarehouseAvailability, sellableIn } from "./warehouse-stock";
import { BusinessError } from "./errors";
import { convertPriceRows } from "./exchange-rate";
import { resolvePrice } from "./pricing";
import { assertQuantityScale, assertWholePackages, packageCount, qty } from "./quantity";

// The cart, kept on the server.
//
// It used to live in the browser's local storage, which meant a purchaser who
// built a basket on the phone found it missing on the desktop, and a rep who
// closed the tab lost the customer's order. One row per (company, owner) fixes
// both, and it costs nothing else: the cart still stores only what the person
// chose — variant and quantity — while price, campaign and VAT are resolved on
// read, exactly the way the quote endpoint does it.
//
// What it deliberately does *not* do is validate MOQ, case multiples or stock.
// A cart is a draft; getting told off for a quantity you are still editing
// would be maddening. Those rules are enforced where they matter — quoting and
// ordering — and the read below reports the numbers the UI needs to guide the
// user towards a valid quantity.
//
// The one thing checked on write is the *shape* of the quantity: a line may
// carry only as many decimals as the variant's `quantityScale` allows (0,75 kg
// yes, 1,5 koli no). That used to be the schema's `.int()`; with fractional
// stock it depends on the variant, so it moved here.
//
// Paket birimi (F2): satır "2 koli" olarak eklenebilir. Miktar yine taban
// birimde saklanır (24), `unitId` yalnızca satırın hangi birimle görüneceğini
// söyler. Paketle eklenen satır tam paket olmalı — bu da miktarın biçimi,
// yukarıdaki ölçek denetimiyle aynı yerde.

export interface CartLineView {
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  color: string | null;
  size: string | null;
  unitsPerCase: number;
  moqUnits: number;
  stock: number;
  /** Satış birimi (ADET, KG, MT…) ve miktarın kaç ondalık alabildiği. */
  unit: string | null;
  quantityScale: number;
  vatRate: number;
  /** Taban birimde miktar. */
  quantity: number;
  /** Satırın paket birimi; null = taban birim. */
  unitId: string | null;
  /** Kalemin seçilebilir paket birimleri, çarpana göre sıralı. */
  units: Array<{ id: string; name: string; factor: number }>;
  /** Paketli satırda paket başına net fiyat ("koli 90,00 ₺"); değilse null. */
  packageNetPrice: string | null;
  /** Null when the company has no applicable price — the line is not orderable. */
  netUnitPrice: string | null;
  /**
   * Fiyatın listelendiği para birimi ve o birimdeki liste fiyatı. Tutar her
   * zaman TL; bunlar sepette "≈ 12,50 USD" notu için. Kur burada taşınmıyor:
   * sepetteki kur henüz donmadı, sipariş verildiğinde donacak.
   */
  listCurrency: string | null;
  listUnitPrice: string | null;
  image: string | null;
}

export interface CartView {
  companyId: string;
  updatedAt: string | null;
  lines: CartLineView[];
}

const EMPTY: Omit<CartView, "companyId"> = { updatedAt: null, lines: [] };

/**
 * Read the caller's cart for a company, priced for that company.
 *
 * Lines whose variant or product has since been deactivated are dropped from
 * the answer *and* from the row: a cart holding a product that no longer exists
 * would fail at checkout with nothing the buyer could do about it.
 */
export async function getCart(
  companyId: string,
  ownerId: string,
): Promise<CartView> {
  const cart = await prisma.cart.findUnique({
    where: { companyId_ownerId: { companyId, ownerId } },
    select: {
      id: true,
      updatedAt: true,
      items: {
        select: {
          quantity: true,
          unitId: true,
          variant: {
            select: {
              id: true,
              sku: true,
              color: true,
              size: true,
              unitsPerCase: true,
              moqUnits: true,
              stock: true,
              unit: true,
              quantityScale: true,
              pricingUnit: true,
              unitFactor: true,
              units: {
                where: { isActive: true },
                select: { id: true, name: true, factor: true },
                orderBy: [{ factor: "asc" }, { sortOrder: "asc" }],
              },
              prices: {
                select: {
                  customerGroupId: true,
                  unitId: true,
                  minQuantity: true,
                  price: true,
                  currency: true,
                },
              },
              product: {
                select: {
                  id: true,
                  name: true,
                  images: true,
                  vatRate: true,
                  categoryId: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!cart) return { companyId, ...EMPTY };

  const ctx = await loadCompanyPricingContext(companyId);
  // Depo modülünde sepet de müşterinin deposunun adedini gösterir — katalogla
  // ve siparişin kontrol ettiği sayıyla aynı.
  const stockIn = ctx.warehouse
    ? await loadWarehouseAvailability(
        prisma,
        ctx.warehouse.id,
        cart.items.map((i) => i.variant.id),
      )
    : null;

  const stale: string[] = [];
  const lines: CartLineView[] = [];

  for (const item of cart.items) {
    const v = item.variant;
    if (!v.product.isActive) {
      stale.push(v.id);
      continue;
    }

    let netUnitPrice: string | null = null;
    let listCurrency: string | null = null;
    let listUnitPrice: string | null = null;
    let packageNetPrice: string | null = null;
    // Birim kapatılmışsa ya da miktar artık tam paket değilse satır taban
    // birimde fiyatlanır; sipariş adımı tam paket kuralını ayrıca denetler.
    const unit = item.unitId ? v.units.find((u) => u.id === item.unitId) : undefined;
    const packaged =
      unit && Number.isInteger(packageCount(item.quantity, unit.factor)) ? unit : null;
    try {
      const priced = resolvePrice({
        prices: convertPriceRows(v.prices, ctx.rates),
        customerGroupId: ctx.customerGroupId,
        quantity: qty(item.quantity),
        productId: v.product.id,
        categoryId: v.product.categoryId,
        discounts: ctx.discounts,
        volumeDiscountPercent: ctx.volumeDiscount?.percent ?? null,
        unitFactor: v.unitFactor,
        unit: packaged ? { id: packaged.id, factor: packaged.factor } : null,
      });
      netUnitPrice = priced.netUnitPrice.toFixed(2);
      packageNetPrice = priced.package ? priced.package.netUnitPrice.toFixed(2) : null;
      listCurrency = priced.listCurrency;
      listUnitPrice = priced.listUnitPrice.toFixed(2);
    } catch {
      // Priceless for this company: still shown, so the buyer understands why
      // checkout refuses, rather than the line vanishing without explanation.
    }

    lines.push({
      variantId: v.id,
      sku: v.sku,
      productId: v.product.id,
      productName: v.product.name,
      color: v.color,
      size: v.size,
      unitsPerCase: v.unitsPerCase,
      moqUnits: qty(v.moqUnits),
      stock: stockIn ? sellableIn(availabilityOf(stockIn, v.id)) : qty(v.stock),
      unit: v.unit,
      quantityScale: v.quantityScale,
      vatRate: v.product.vatRate,
      quantity: qty(item.quantity),
      unitId: packaged?.id ?? null,
      units: v.units.map((u) => ({ id: u.id, name: u.name, factor: qty(u.factor) })),
      packageNetPrice,
      netUnitPrice,
      listCurrency,
      listUnitPrice,
      image: v.product.images[0] ?? null,
    });
  }

  if (stale.length > 0) {
    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id, variantId: { in: stale } },
    });
  }

  return {
    companyId,
    updatedAt: cart.updatedAt.toISOString(),
    lines: lines.sort((a, b) => a.productName.localeCompare(b.productName, "tr")),
  };
}

/** Create the cart row if this is the owner's first line for the company. */
async function ensureCart(companyId: string, ownerId: string): Promise<string> {
  const existing = await prisma.cart.findUnique({
    where: { companyId_ownerId: { companyId, ownerId } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.cart.create({
    data: { companyId, ownerId },
    select: { id: true },
  });
  return created.id;
}

/**
 * Replace the cart wholesale. This is what the portal sends as the user edits:
 * last write wins, which is the right rule for a draft one person is editing in
 * two tabs — merging quantities behind their back would be worse.
 */
export async function setCart(
  input: SetCartInput,
  ownerId: string,
): Promise<CartView> {
  await assertCartLines(input.items);
  const cartId = await ensureCart(input.companyId, ownerId);

  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { cartId } }),
    ...(input.items.length > 0
      ? [
          prisma.cartItem.createMany({
            data: input.items.map((i) => ({
              cartId,
              variantId: i.variantId,
              quantity: i.quantity,
              unitId: i.unitId ?? null,
            })),
          }),
        ]
      : []),
    // Touch the row so `updatedAt` reflects the edit even when only items moved.
    prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } }),
  ]);

  return getCart(input.companyId, ownerId);
}

/** Add, set or (quantity 0) remove a single line. */
export async function upsertCartItem(
  input: UpsertCartItemInput,
  ownerId: string,
): Promise<CartView> {
  const cartId = await ensureCart(input.companyId, ownerId);

  if (input.quantity === 0) {
    await prisma.cartItem.deleteMany({
      where: { cartId, variantId: input.variantId },
    });
  } else {
    const unitId = input.unitId ?? null;
    if (input.increment) {
      // Eklenen miktar kendi biriminde tam paket olmalı; toplam, mevcut satırla
      // birlikte denetlenir. Satır farklı bir birimdeyse toplam taban birime
      // düşer: 1 koli + 5 adet "1,4 koli" değildir.
      const existing = await prisma.cartItem.findUnique({
        where: { cartId_variantId: { cartId, variantId: input.variantId } },
        select: { quantity: true, unitId: true },
      });
      await assertCartLines([{ variantId: input.variantId, quantity: input.quantity, unitId }]);
      const keepUnit = !existing || existing.unitId === unitId ? unitId : null;
      await prisma.cartItem.upsert({
        where: { cartId_variantId: { cartId, variantId: input.variantId } },
        create: { cartId, variantId: input.variantId, quantity: input.quantity, unitId },
        update: { quantity: { increment: input.quantity }, unitId: keepUnit },
      });
    } else {
      await assertCartLines([{ variantId: input.variantId, quantity: input.quantity, unitId }]);
      await prisma.cartItem.upsert({
        where: { cartId_variantId: { cartId, variantId: input.variantId } },
        create: { cartId, variantId: input.variantId, quantity: input.quantity, unitId },
        update: { quantity: input.quantity, unitId },
      });
    }
  }

  await prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  return getCart(input.companyId, ownerId);
}

/**
 * Empty the cart. Called by the portal's "clear" button and, more importantly,
 * after an order is placed — leaving the basket full behind a submitted order
 * invites the same order twice.
 */
export async function clearCart(companyId: string, ownerId: string): Promise<void> {
  const cart = await prisma.cart.findUnique({
    where: { companyId_ownerId: { companyId, ownerId } },
    select: { id: true },
  });
  if (!cart) return;
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
}

async function assertCartLines(
  items: ReadonlyArray<{ variantId: string; quantity: number; unitId?: string | null }>,
): Promise<void> {
  const unique = [...new Set(items.map((i) => i.variantId))];
  if (unique.length === 0) return;

  const found = await prisma.productVariant.findMany({
    where: { id: { in: unique }, product: { isActive: true } },
    select: {
      id: true,
      sku: true,
      unit: true,
      quantityScale: true,
      units: { where: { isActive: true }, select: { id: true, name: true, factor: true } },
    },
  });
  if (found.length !== unique.length) {
    throw new BusinessError(
      "VARIANT_NOT_FOUND",
      "Sepetteki ürünlerden biri artık satışta değil",
    );
  }
  const byId = new Map(found.map((v) => [v.id, v]));
  for (const item of items) {
    const v = byId.get(item.variantId)!;
    assertQuantityScale(item.quantity, v.quantityScale, v.sku);
    if (item.unitId) {
      const unit = v.units.find((u) => u.id === item.unitId);
      if (!unit) {
        throw new BusinessError("UNIT_NOT_FOUND", `${v.sku}: birim bulunamadı`, {
          sku: v.sku,
          unitId: item.unitId,
        });
      }
      assertWholePackages(item.quantity, unit, v.sku, v.unit);
    }
  }
}
