import { prisma } from "@repo/database";
import type { SetCartInput, UpsertCartItemInput } from "@repo/types";
import { loadCompanyPricingContext } from "./catalog";
import { BusinessError } from "./errors";
import { convertPriceRows } from "./exchange-rate";
import { resolvePrice } from "./pricing";

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
  vatRate: number;
  quantity: number;
  /** Null when the company has no applicable price — the line is not orderable. */
  netUnitPrice: string | null;
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
          variant: {
            select: {
              id: true,
              sku: true,
              color: true,
              size: true,
              unitsPerCase: true,
              moqUnits: true,
              stock: true,
              prices: {
                select: {
                  customerGroupId: true,
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

  const stale: string[] = [];
  const lines: CartLineView[] = [];

  for (const item of cart.items) {
    const v = item.variant;
    if (!v.product.isActive) {
      stale.push(v.id);
      continue;
    }

    let netUnitPrice: string | null = null;
    try {
      const priced = resolvePrice({
        prices: convertPriceRows(v.prices, ctx.rates),
        customerGroupId: ctx.customerGroupId,
        quantity: item.quantity,
        productId: v.product.id,
        categoryId: v.product.categoryId,
        discounts: ctx.discounts,
        volumeDiscountPercent: ctx.volumeDiscount?.percent ?? null,
      });
      netUnitPrice = priced.netUnitPrice.toFixed(2);
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
      moqUnits: v.moqUnits,
      stock: v.stock,
      vatRate: v.product.vatRate,
      quantity: item.quantity,
      netUnitPrice,
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
  await assertVariantsExist(input.items.map((i) => i.variantId));
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
    await assertVariantsExist([input.variantId]);
    await prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId: input.variantId } },
      create: { cartId, variantId: input.variantId, quantity: input.quantity },
      update: input.increment
        ? { quantity: { increment: input.quantity } }
        : { quantity: input.quantity },
    });
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

async function assertVariantsExist(variantIds: string[]): Promise<void> {
  const unique = [...new Set(variantIds)];
  if (unique.length === 0) return;

  const found = await prisma.productVariant.count({
    where: { id: { in: unique }, product: { isActive: true } },
  });
  if (found !== unique.length) {
    throw new BusinessError(
      "VARIANT_NOT_FOUND",
      "Sepetteki ürünlerden biri artık satışta değil",
    );
  }
}
