import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { clearCart, getCart, setCart, upsertCartItem } from "../../src/cart";

// The server cart. What matters here is that it stores intent and nothing else:
// no prices are frozen into it, and a product leaving the catalogue takes its
// line with it rather than waiting to fail at checkout.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `ct${Date.now()}`;

let companyId: string;
let groupId: string;
let categoryId: string;
let productId: string;
let retiredProductId: string;
let variantA: string;
let variantB: string;
let retiredVariant: string;
let ownerId: string;
let otherId: string;

suite("server-side cart", () => {
  beforeAll(async () => {
    const group = await prisma.customerGroup.create({ data: { name: `CT Grup ${TAG}` } });
    groupId = group.id;
    const company = await prisma.company.create({
      data: { name: `CT Firma ${TAG}`, customerGroupId: groupId, creditLimit: 1_000_000 },
    });
    companyId = company.id;

    const owner = await prisma.user.create({
      data: {
        email: `ct-owner-${TAG}@test.local`,
        name: "CT Sahibi",
        passwordHash: "x",
        role: "COMPANY_ADMIN",
        companyId,
      },
    });
    ownerId = owner.id;
    const other = await prisma.user.create({
      data: {
        email: `ct-other-${TAG}@test.local`,
        name: "CT Diğer",
        passwordHash: "x",
        role: "COMPANY_STAFF",
        companyId,
      },
    });
    otherId = other.id;

    const category = await prisma.category.create({
      data: { name: `CT Kategori ${TAG}`, slug: `ct-kat-${TAG}` },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        name: `CT Ürün ${TAG}`,
        slug: `ct-urun-${TAG}`,
        vatRate: 20,
        categoryId,
        images: ["/api/media/products/kapak.jpg"],
        variants: {
          create: [
            { sku: `CTA-${TAG}`, unitsPerCase: 6, moqUnits: 6, stock: 500 },
            { sku: `CTB-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 500 },
          ],
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantA = product.variants.find((v) => v.sku.startsWith("CTA"))!.id;
    variantB = product.variants.find((v) => v.sku.startsWith("CTB"))!.id;

    // Priced for A only: B exists but no price list covers it, which is a real
    // state in a catalogue mid-setup.
    await prisma.price.create({ data: { variantId: variantA, minQuantity: 1, price: 25 } });

    const retired = await prisma.product.create({
      data: {
        name: `CT Kalkan ${TAG}`,
        slug: `ct-kalkan-${TAG}`,
        vatRate: 20,
        categoryId,
        variants: { create: [{ sku: `CTC-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 10 }] },
      },
      include: { variants: true },
    });
    retiredProductId = retired.id;
    retiredVariant = retired.variants[0]!.id;
    await prisma.price.create({
      data: { variantId: retiredVariant, minQuantity: 1, price: 5 },
    });
  });

  afterAll(async () => {
    if (!hasDb) return;
    await prisma.cart.deleteMany({ where: { companyId } });
    await prisma.price.deleteMany({
      where: { variantId: { in: [variantA, variantB, retiredVariant] } },
    });
    await prisma.product.deleteMany({ where: { id: { in: [productId, retiredProductId] } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.$disconnect();
  });

  it("starts empty and needs no row to say so", async () => {
    const cart = await getCart(companyId, ownerId);
    expect(cart.lines).toEqual([]);
    expect(cart.updatedAt).toBeNull();
    expect(await prisma.cart.count({ where: { companyId, ownerId } })).toBe(0);
  });

  it("prices lines on read instead of storing money", async () => {
    await setCart({ companyId, items: [{ variantId: variantA, quantity: 12 }] }, ownerId);
    const cart = await getCart(companyId, ownerId);

    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]!.netUnitPrice).toBe("25.00");
    expect(cart.lines[0]!.image).toBe("/api/media/products/kapak.jpg");

    // Change the price list; the cart follows it without being touched.
    await prisma.price.updateMany({ where: { variantId: variantA }, data: { price: 30 } });
    const after = await getCart(companyId, ownerId);
    expect(after.lines[0]!.netUnitPrice).toBe("30.00");
    await prisma.price.updateMany({ where: { variantId: variantA }, data: { price: 25 } });
  });

  it("keeps a line the company has no price for, so the buyer can see why", async () => {
    await setCart({ companyId, items: [{ variantId: variantB, quantity: 3 }] }, ownerId);
    const cart = await getCart(companyId, ownerId);
    expect(cart.lines[0]!.variantId).toBe(variantB);
    expect(cart.lines[0]!.netUnitPrice).toBeNull();
  });

  it("gives each person their own cart for the same company", async () => {
    await setCart({ companyId, items: [{ variantId: variantA, quantity: 6 }] }, ownerId);
    await setCart({ companyId, items: [{ variantId: variantB, quantity: 2 }] }, otherId);

    expect((await getCart(companyId, ownerId)).lines[0]!.variantId).toBe(variantA);
    expect((await getCart(companyId, otherId)).lines[0]!.variantId).toBe(variantB);
    expect(await prisma.cart.count({ where: { companyId } })).toBe(2);
  });

  it("adds, overwrites and removes a single line", async () => {
    await setCart({ companyId, items: [] }, ownerId);

    await upsertCartItem({ companyId, variantId: variantA, quantity: 6 }, ownerId);
    await upsertCartItem(
      { companyId, variantId: variantA, quantity: 6, increment: true },
      ownerId,
    );
    expect((await getCart(companyId, ownerId)).lines[0]!.quantity).toBe(12);

    await upsertCartItem({ companyId, variantId: variantA, quantity: 30 }, ownerId);
    expect((await getCart(companyId, ownerId)).lines[0]!.quantity).toBe(30);

    await upsertCartItem({ companyId, variantId: variantA, quantity: 0 }, ownerId);
    expect((await getCart(companyId, ownerId)).lines).toEqual([]);
  });

  it("accepts a draft quantity that no order would take", async () => {
    // 7 is neither the MOQ nor a case multiple of 6. A cart is a draft; being
    // told off mid-edit would be maddening, and the order path still refuses it.
    await setCart({ companyId, items: [{ variantId: variantA, quantity: 7 }] }, ownerId);
    expect((await getCart(companyId, ownerId)).lines[0]!.quantity).toBe(7);
  });

  it("drops a line whose product left the catalogue, and forgets it", async () => {
    await setCart(
      {
        companyId,
        items: [
          { variantId: variantA, quantity: 6 },
          { variantId: retiredVariant, quantity: 1 },
        ],
      },
      ownerId,
    );
    await prisma.product.update({
      where: { id: retiredProductId },
      data: { isActive: false },
    });

    const cart = await getCart(companyId, ownerId);
    expect(cart.lines.map((l) => l.variantId)).toEqual([variantA]);

    // Not just filtered from the answer — actually removed.
    const cartId = (await prisma.cart.findUniqueOrThrow({
      where: { companyId_ownerId: { companyId, ownerId } },
      select: { id: true },
    })).id;
    expect(await prisma.cartItem.count({ where: { cartId } })).toBe(1);

    await prisma.product.update({
      where: { id: retiredProductId },
      data: { isActive: true },
    });
  });

  it("refuses to store a variant that is not for sale", async () => {
    await prisma.product.update({
      where: { id: retiredProductId },
      data: { isActive: false },
    });
    await expect(
      setCart({ companyId, items: [{ variantId: retiredVariant, quantity: 1 }] }, ownerId),
    ).rejects.toMatchObject({ code: "VARIANT_NOT_FOUND" });
    await prisma.product.update({
      where: { id: retiredProductId },
      data: { isActive: true },
    });
  });

  it("empties without deleting the cart itself", async () => {
    await setCart({ companyId, items: [{ variantId: variantA, quantity: 6 }] }, ownerId);
    await clearCart(companyId, ownerId);

    expect((await getCart(companyId, ownerId)).lines).toEqual([]);
    expect(await prisma.cart.count({ where: { companyId, ownerId } })).toBe(1);
  });
});
