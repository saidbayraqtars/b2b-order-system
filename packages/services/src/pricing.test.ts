import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { resolvePrice, type DiscountRow, type PriceRow } from "./pricing";
import { BusinessError } from "./errors";

const D = (n: string | number) => new Prisma.Decimal(n);

const PRODUCT = "prod-1";
const CATEGORY = "cat-1";
const GROUP = "group-1";

function prices(...rows: Array<[string | null, number, string]>): PriceRow[] {
  return rows.map(([customerGroupId, minQuantity, price]) => ({
    customerGroupId,
    minQuantity,
    price: D(price),
  }));
}

describe("resolvePrice — tier selection", () => {
  it("takes the group price over the default list price", () => {
    const r = resolvePrice({
      prices: prices([null, 1, "12.50"], [GROUP, 1, "10.00"]),
      customerGroupId: GROUP,
      quantity: 1,
      productId: PRODUCT,
      categoryId: CATEGORY,
      discounts: [],
    });
    expect(r.unitPrice.toFixed(2)).toBe("10.00");
  });

  it("falls back to the default tier when the company has no group", () => {
    const r = resolvePrice({
      prices: prices([null, 1, "12.50"], [GROUP, 1, "10.00"]),
      customerGroupId: null,
      quantity: 1,
      productId: PRODUCT,
      categoryId: CATEGORY,
      discounts: [],
    });
    expect(r.unitPrice.toFixed(2)).toBe("12.50");
  });

  it("picks the highest tier still at or below the quantity", () => {
    const rows = prices([GROUP, 1, "10.00"], [GROUP, 100, "9.50"], [GROUP, 500, "9.00"]);
    const at = (quantity: number) =>
      resolvePrice({
        prices: rows,
        customerGroupId: GROUP,
        quantity,
        productId: PRODUCT,
        categoryId: CATEGORY,
        discounts: [],
      }).unitPrice.toFixed(2);

    expect(at(99)).toBe("10.00");
    expect(at(100)).toBe("9.50"); // boundary: the tier starts exactly here
    expect(at(499)).toBe("9.50");
    expect(at(500)).toBe("9.00");
    expect(at(10_000)).toBe("9.00");
  });

  it("breaks a tie between equal thresholds with the cheaper price", () => {
    const r = resolvePrice({
      prices: prices([GROUP, 10, "9.00"], [GROUP, 10, "8.00"]),
      customerGroupId: GROUP,
      quantity: 10,
      productId: PRODUCT,
      categoryId: CATEGORY,
      discounts: [],
    });
    expect(r.unitPrice.toFixed(2)).toBe("8.00");
  });

  it("throws NO_PRICE when nothing applies at that quantity", () => {
    expect(() =>
      resolvePrice({
        prices: prices([GROUP, 50, "9.00"]),
        customerGroupId: GROUP,
        quantity: 10,
        productId: PRODUCT,
        categoryId: CATEGORY,
        discounts: [],
      }),
    ).toThrowError(BusinessError);
  });

  it("ignores another group's price rows entirely", () => {
    expect(() =>
      resolvePrice({
        prices: prices(["other-group", 1, "5.00"]),
        customerGroupId: GROUP,
        quantity: 1,
        productId: PRODUCT,
        categoryId: CATEGORY,
        discounts: [],
      }),
    ).toThrowError(/Fiyat tanımlı değil|fiyat/i);
  });
});

describe("resolvePrice — company discount", () => {
  const base: DiscountRow[] = [
    { categoryId: CATEGORY, productId: null, discountType: "PERCENTAGE", value: D(10) },
    { categoryId: null, productId: PRODUCT, discountType: "PERCENTAGE", value: D(20) },
  ];

  it("lets a product discount win over a category discount", () => {
    const r = resolvePrice({
      prices: prices([null, 1, "100.00"]),
      customerGroupId: null,
      quantity: 1,
      productId: PRODUCT,
      categoryId: CATEGORY,
      discounts: base,
    });
    expect(r.discountPerUnit.toFixed(2)).toBe("20.00");
    expect(r.netUnitPrice.toFixed(2)).toBe("80.00");
  });

  it("applies the category discount when no product discount matches", () => {
    const r = resolvePrice({
      prices: prices([null, 1, "100.00"]),
      customerGroupId: null,
      quantity: 1,
      productId: "another-product",
      categoryId: CATEGORY,
      discounts: base,
    });
    expect(r.discountPerUnit.toFixed(2)).toBe("10.00");
  });

  it("never lets a fixed discount push the unit price below zero", () => {
    const r = resolvePrice({
      prices: prices([null, 1, "10.00"]),
      customerGroupId: null,
      quantity: 3,
      productId: PRODUCT,
      categoryId: CATEGORY,
      discounts: [
        { categoryId: null, productId: PRODUCT, discountType: "FIXED", value: D(999) },
      ],
    });
    expect(r.discountPerUnit.toFixed(2)).toBe("10.00");
    expect(r.netUnitPrice.toFixed(2)).toBe("0.00");
    expect(r.lineNet.toFixed(2)).toBe("0.00");
  });

  it("rounds the discount to kuruş before multiplying by quantity", () => {
    // 33,33 × 15 % = 4,9995 → 5,00 per unit, so the line is quantity × 28,33.
    const r = resolvePrice({
      prices: prices([null, 1, "33.33"]),
      customerGroupId: null,
      quantity: 3,
      productId: PRODUCT,
      categoryId: CATEGORY,
      discounts: [
        { categoryId: CATEGORY, productId: null, discountType: "PERCENTAGE", value: D(15) },
      ],
    });
    expect(r.discountPerUnit.toFixed(2)).toBe("5.00");
    expect(r.netUnitPrice.toFixed(2)).toBe("28.33");
    expect(r.lineNet.toFixed(2)).toBe("84.99");
  });
});
