import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { createOrder } from "../../src/order";
import { runReport } from "../../src/report-engine";
import type { ReportContext } from "../../src/report-registry";

// Grouped reports now run as GROUP BY in the database. Two things have to hold
// and neither is visible from the SQL alone: the numbers must match what the
// old in-memory fold produced, and the row scope must still be applied — a
// scope that was only wired into the Prisma path would be a leak the moment
// someone pressed "group by".

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `rs${Date.now()}`;

let groupId: string;
let categoryId: string;
let companyA: string;
let companyB: string;
let repA: string;
let repB: string;
let buyerA: string;
let buyerB: string;
let adminId: string;
let productId: string;
let variantId: string;

const admin = (): ReportContext => ({
  userId: adminId,
  role: "SUPER_ADMIN",
  companyId: null,
});

suite("grouped reports run in the database", () => {
  beforeAll(async () => {
    const group = await prisma.customerGroup.create({ data: { name: `RS Grup ${TAG}` } });
    groupId = group.id;
    const category = await prisma.category.create({
      data: { name: `RS Kategori ${TAG}`, slug: `rs-kat-${TAG}` },
    });
    categoryId = category.id;

    const makeRep = async (suffix: string) =>
      (
        await prisma.user.create({
          data: {
            email: `rs-rep-${suffix}-${TAG}@test.local`,
            name: `RS Plasiyer ${suffix}`,
            passwordHash: "x",
            role: "SALES_REP",
          },
        })
      ).id;
    repA = await makeRep("a");
    repB = await makeRep("b");

    const makeCompany = async (suffix: string, salesRepId: string) =>
      (
        await prisma.company.create({
          data: {
            name: `RS Firma ${suffix} ${TAG}`,
            customerGroupId: groupId,
            salesRepId,
            creditLimit: 10_000_000,
          },
        })
      ).id;
    companyA = await makeCompany("A", repA);
    companyB = await makeCompany("B", repB);

    const makeBuyer = async (suffix: string, companyId: string) =>
      (
        await prisma.user.create({
          data: {
            email: `rs-buyer-${suffix}-${TAG}@test.local`,
            name: `RS Alıcı ${suffix}`,
            passwordHash: "x",
            role: "COMPANY_ADMIN",
            companyId,
          },
        })
      ).id;
    buyerA = await makeBuyer("a", companyA);
    buyerB = await makeBuyer("b", companyB);

    adminId = (
      await prisma.user.create({
        data: {
          email: `rs-admin-${TAG}@test.local`,
          name: "RS Admin",
          passwordHash: "x",
          role: "SUPER_ADMIN",
        },
      })
    ).id;

    const product = await prisma.product.create({
      data: {
        name: `RS Ürün ${TAG}`,
        slug: `rs-urun-${TAG}`,
        vatRate: 20,
        categoryId,
        variants: {
          create: [{ sku: `RSA-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 100_000 }],
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0]!.id;
    await prisma.price.create({ data: { variantId, minQuantity: 1, price: 100 } });

    // A: two orders of 1.000 ₺ net. B: one of 500 ₺.
    for (const [companyId, buyerId, quantity] of [
      [companyA, buyerA, 10],
      [companyA, buyerA, 10],
      [companyB, buyerB, 5],
    ] as const) {
      await createOrder(
        {
          companyId,
          paymentMethod: "OPEN_ACCOUNT",
          items: [{ variantId, quantity }],
        },
        { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
      );
    }
  });

  afterAll(async () => {
    if (!hasDb) return;
    const companies = [companyA, companyB];
    const orders = await prisma.order.findMany({
      where: { companyId: { in: companies } },
      select: { id: true },
    });
    await prisma.transaction.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    await prisma.price.deleteMany({ where: { variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({
      where: { id: { in: [buyerA, buyerB, repA, repB, adminId] } },
    });
    await prisma.company.deleteMany({ where: { id: { in: companies } } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.$disconnect();
  });

  /** Only this fixture's companies, so other suites' rows cannot skew a total. */
  const onlyOurs = {
    field: "customerGroupName",
    operator: "eq" as const,
    value: `RS Grup ${TAG}`,
  };

  it("groups by a relation column — the thing Prisma could not do", async () => {
    const result = await runReport(
      "ORDERS",
      {
        columns: [
          { field: "companyName" },
          { field: "grandTotal", aggregate: "SUM" },
          { field: "orderNumber", aggregate: "COUNT" },
        ],
        filters: [onlyOurs],
        groupBy: ["companyName"],
        sort: [{ field: "companyName", direction: "asc" }],
      },
      admin(),
    );

    expect(result.grouped).toBe(true);
    expect(result.rows).toHaveLength(2);

    const [a, b] = result.rows;
    expect(a!.companyName).toBe(`RS Firma A ${TAG}`);
    expect(a!.grandTotal__sum).toBe(2400); // 2 × (1000 + 200 KDV)
    expect(a!.orderNumber__count).toBe(2);
    expect(b!.grandTotal__sum).toBe(600); // 5 × 100 + KDV
    expect(b!.orderNumber__count).toBe(1);
  });

  it("counts rows for COUNT and distinct values for COUNT_DISTINCT", async () => {
    const result = await runReport(
      "ORDERS",
      {
        columns: [
          { field: "customerGroupName" },
          { field: "orderNumber", aggregate: "COUNT" },
          { field: "companyName", aggregate: "COUNT_DISTINCT" },
        ],
        filters: [onlyOurs],
        groupBy: ["customerGroupName"],
        sort: [],
      },
      admin(),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.orderNumber__count).toBe(3);
    expect(result.rows[0]!.companyName__count_distinct).toBe(2);
  });

  it("produces one grand-total row when nothing is grouped", async () => {
    const result = await runReport(
      "ORDERS",
      {
        columns: [
          { field: "grandTotal", aggregate: "SUM" },
          { field: "grandTotal", aggregate: "AVG" },
          { field: "grandTotal", aggregate: "MIN" },
          { field: "grandTotal", aggregate: "MAX" },
        ],
        filters: [onlyOurs],
        groupBy: [],
        sort: [],
      },
      admin(),
    );

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0]!;
    expect(row.grandTotal__sum).toBe(3000); // 1200 + 1200 + 600
    expect(row.grandTotal__avg).toBe(1000);
    expect(row.grandTotal__min).toBe(600);
    expect(row.grandTotal__max).toBe(1200);
  });

  it("applies the caller's row scope to the grouped query too", async () => {
    const repView = await runReport(
      "ORDERS",
      {
        columns: [
          { field: "companyName" },
          { field: "grandTotal", aggregate: "SUM" },
        ],
        filters: [onlyOurs],
        groupBy: ["companyName"],
        sort: [],
      },
      { userId: repA, role: "SALES_REP", companyId: null },
    );

    // Rep A owns company A only. Seeing B here would mean the scope was lost on
    // the way to SQL.
    expect(repView.rows.map((r) => r.companyName)).toEqual([`RS Firma A ${TAG}`]);
    expect(repView.rows[0]!.grandTotal__sum).toBe(2400);

    const buyerView = await runReport(
      "ORDERS",
      {
        columns: [
          { field: "companyName" },
          { field: "grandTotal", aggregate: "SUM" },
        ],
        filters: [onlyOurs],
        groupBy: ["companyName"],
        sort: [],
      },
      { userId: buyerB, role: "COMPANY_ADMIN", companyId: companyB },
    );
    expect(buyerView.rows.map((r) => r.companyName)).toEqual([`RS Firma B ${TAG}`]);
  });

  it("keeps a user filter and the scope both in force", async () => {
    const result = await runReport(
      "ORDERS",
      {
        columns: [
          { field: "companyName" },
          { field: "grandTotal", aggregate: "SUM" },
        ],
        // A filter naming the *other* company must not widen a rep's view.
        filters: [onlyOurs, { field: "companyName", operator: "contains", value: "RS Firma" }],
        groupBy: ["companyName"],
        sort: [],
      },
      { userId: repA, role: "SALES_REP", companyId: null },
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.companyName).toBe(`RS Firma A ${TAG}`);
  });

  it("buckets dates in the reporting timezone", async () => {
    const result = await runReport(
      "ORDERS",
      {
        columns: [
          { field: "createdAt_day" },
          { field: "orderNumber", aggregate: "COUNT" },
        ],
        filters: [onlyOurs],
        groupBy: ["createdAt_day"],
        sort: [],
      },
      admin(),
    );

    // All three orders were placed just now, so they land in one bucket, and it
    // is today's date in Istanbul rather than whatever UTC says.
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.createdAt_day).toBe(today);
    expect(result.rows[0]!.orderNumber__count).toBe(3);
  });

  it("groups a dataset that reaches two relations deep", async () => {
    const result = await runReport(
      "ORDER_ITEMS",
      {
        columns: [
          { field: "salesRepName" },
          { field: "categoryName" },
          { field: "quantity", aggregate: "SUM" },
        ],
        filters: [
          { field: "categoryName", operator: "eq", value: `RS Kategori ${TAG}` },
        ],
        groupBy: ["salesRepName", "categoryName"],
        sort: [{ field: "salesRepName", direction: "asc" }],
      },
      admin(),
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.salesRepName).toBe("RS Plasiyer a");
    expect(result.rows[0]!.quantity__sum).toBe(20);
    expect(result.rows[1]!.quantity__sum).toBe(5);
  });

  it("still returns a plain listing through the Prisma path", async () => {
    const result = await runReport(
      "ORDERS",
      {
        columns: [{ field: "orderNumber" }, { field: "companyName" }],
        filters: [onlyOurs],
        groupBy: [],
        sort: [],
        limit: 2,
      },
      admin(),
    );
    expect(result.grouped).toBe(false);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.orderNumber).toBeTruthy();
  });
});
