import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { createOrder } from "../../src/order";
import {
  createDashboard,
  deleteDashboard,
  getDashboard,
  listDashboards,
  runDashboard,
  updateDashboard,
} from "../../src/report-dashboard";
import { createReportDefinition } from "../../src/report-definition";
import type { ReportContext } from "../../src/report-registry";

// A board is a list of pointers to saved reports. The things worth testing are
// the ones that are not visible from the shape: that every tile is still run
// under the VIEWER's scope, and that one broken tile does not take the board
// down with it.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `db${Date.now()}`;

let groupId: string;
let categoryId: string;
let companyA: string;
let companyB: string;
let repA: string;
let buyerA: string;
let buyerB: string;
let adminId: string;
let productId: string;
let variantId: string;

let sharedReport: string;
let privateReport: string;
const dashboardIds: string[] = [];

const admin = (): ReportContext => ({
  userId: adminId,
  role: "SUPER_ADMIN",
  companyId: null,
});
const rep = (): ReportContext => ({
  userId: repA,
  role: "SALES_REP",
  companyId: null,
});

suite("report dashboards", () => {
  beforeAll(async () => {
    const group = await prisma.customerGroup.create({
      data: { name: `DB Grup ${TAG}` },
    });
    groupId = group.id;
    const category = await prisma.category.create({
      data: { name: `DB Kategori ${TAG}`, slug: `db-kat-${TAG}` },
    });
    categoryId = category.id;

    repA = (
      await prisma.user.create({
        data: {
          email: `db-rep-${TAG}@test.local`,
          name: "DB Plasiyer",
          passwordHash: "x",
          role: "SALES_REP",
        },
      })
    ).id;
    adminId = (
      await prisma.user.create({
        data: {
          email: `db-admin-${TAG}@test.local`,
          name: "DB Admin",
          passwordHash: "x",
          role: "SUPER_ADMIN",
        },
      })
    ).id;

    const makeCompany = async (suffix: string, salesRepId: string | null) =>
      (
        await prisma.company.create({
          data: {
            name: `DB Firma ${suffix} ${TAG}`,
            customerGroupId: groupId,
            ...(salesRepId ? { salesRepId } : {}),
            creditLimit: 10_000_000,
          },
        })
      ).id;
    companyA = await makeCompany("A", repA);
    companyB = await makeCompany("B", null);

    const makeBuyer = async (suffix: string, companyId: string) =>
      (
        await prisma.user.create({
          data: {
            email: `db-buyer-${suffix}-${TAG}@test.local`,
            name: `DB Alıcı ${suffix}`,
            passwordHash: "x",
            role: "COMPANY_ADMIN",
            companyId,
          },
        })
      ).id;
    buyerA = await makeBuyer("a", companyA);
    buyerB = await makeBuyer("b", companyB);

    const product = await prisma.product.create({
      data: {
        name: `DB Ürün ${TAG}`,
        slug: `db-urun-${TAG}`,
        vatRate: 20,
        categoryId,
        variants: {
          create: [{ sku: `DB1-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 1000 }],
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0]!.id;
    await prisma.price.create({ data: { variantId, minQuantity: 1, price: 100 } });

    // One order each, so a scoped view and an unscoped one differ.
    for (const [companyId, buyerId] of [
      [companyA, buyerA],
      [companyB, buyerB],
    ] as const) {
      await createOrder(
        {
          companyId,
          paymentMethod: "OPEN_ACCOUNT",
          items: [{ variantId, quantity: 10 }],
        },
        { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
      );
    }

    const config = {
      columns: [
        { field: "companyName" },
        { field: "grandTotal", aggregate: "SUM" as const },
      ],
      computed: [],
      filters: [
        {
          field: "customerGroupName",
          operator: "eq" as const,
          value: `DB Grup ${TAG}`,
        },
      ],
      groupBy: ["companyName"],
      sort: [{ field: "companyName", direction: "asc" as const }],
    };

    sharedReport = (
      await createReportDefinition(
        { name: `DB Paylaşık ${TAG}`, dataset: "ORDERS", isShared: true, config },
        admin(),
      )
    ).id;
    privateReport = (
      await createReportDefinition(
        { name: `DB Özel ${TAG}`, dataset: "ORDERS", isShared: false, config },
        admin(),
      )
    ).id;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const companies = [companyA, companyB];
    const orders = await prisma.order.findMany({
      where: { companyId: { in: companies } },
      select: { id: true },
    });
    await prisma.reportDashboard.deleteMany({ where: { id: { in: dashboardIds } } });
    await prisma.reportDefinition.deleteMany({
      where: { id: { in: [sharedReport, privateReport] } },
    });
    await prisma.transaction.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    await prisma.price.deleteMany({ where: { variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({
      where: { id: { in: [buyerA, buyerB, repA, adminId] } },
    });
    await prisma.company.deleteMany({ where: { id: { in: companies } } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.$disconnect();
  });

  async function board(
    tiles: unknown[],
    ctx = admin(),
    extra: { isShared?: boolean } = {},
  ) {
    const created = await createDashboard(
      {
        name: `DB Pano ${TAG}-${dashboardIds.length}`,
        tiles: tiles as never,
        ...extra,
      },
      ctx,
    );
    dashboardIds.push(created.id);
    return created.id;
  }

  it("runs every tile and keeps the order they were placed in", async () => {
    const id = await board([
      { definitionId: sharedReport, width: "full", title: "Üstteki" },
      { definitionId: privateReport, width: "half" },
    ]);

    const run = await runDashboard(id, admin());
    expect(run.tiles).toHaveLength(2);
    expect(run.tiles[0]!.title).toBe("Üstteki");
    expect(run.tiles[0]!.width).toBe("full");
    // No title of its own: the report's name stands in.
    expect(run.tiles[1]!.title).toBe(`DB Özel ${TAG}`);
    expect(run.tiles[0]!.result!.rows).toHaveLength(2); // both companies
    expect(run.tiles[1]!.error).toBeNull();
  });

  it("runs each tile under the viewer's scope, not the author's", async () => {
    const id = await board([{ definitionId: sharedReport, width: "half" }], admin(), {
      isShared: true,
    });

    const repRun = await runDashboard(id, rep());
    const rows = repRun.tiles[0]!.result!.rows;
    // The rep owns company A only. Seeing B would mean a board could be used to
    // read past a scope that the report itself enforces.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.companyName).toBe(`DB Firma A ${TAG}`);
  });

  it("reports a tile the viewer may not open without failing the board", async () => {
    const id = await board(
      [
        { definitionId: sharedReport, width: "half" },
        { definitionId: privateReport, width: "half" },
      ],
      admin(),
      { isShared: true },
    );

    const repRun = await runDashboard(id, rep());
    expect(repRun.tiles[0]!.result).not.toBeNull();
    expect(repRun.tiles[1]!.result).toBeNull();
    expect(repRun.tiles[1]!.error).toMatch(/erişiminiz yok/i);
  });

  it("reports a tile whose report was deleted", async () => {
    const throwaway = (
      await createReportDefinition(
        {
          name: `DB Silinecek ${TAG}`,
          dataset: "ORDERS",
          config: {
            columns: [{ field: "orderNumber" }],
            computed: [],
            filters: [],
            groupBy: [],
            sort: [],
          },
        },
        admin(),
      )
    ).id;
    const id = await board([{ definitionId: throwaway, width: "half" }]);
    await prisma.reportDefinition.delete({ where: { id: throwaway } });

    const run = await runDashboard(id, admin());
    expect(run.tiles[0]!.result).toBeNull();
    expect(run.tiles[0]!.error).toMatch(/bulunamadı/i);
  });

  it("refuses to save a tile pointing at a report the author cannot see", async () => {
    await expect(
      createDashboard(
        { name: `DB Ret ${TAG}`, tiles: [{ definitionId: privateReport, width: "half" }] },
        rep(),
      ),
    ).rejects.toThrow(/bulunamadı/i);
  });

  it("shows a board to its owner and to everyone once shared", async () => {
    const own = await board([], admin());
    const shared = await board([], admin(), { isShared: true });

    const repList = await listDashboards(rep());
    const ids = repList.map((d) => d.id);
    expect(ids).toContain(shared);
    expect(ids).not.toContain(own);

    // Reading a private board is refused, not silently empty.
    await expect(getDashboard(own, rep())).rejects.toThrow(/erişiminiz yok/i);
  });

  it("lets the owner edit and delete, and refuses everyone else", async () => {
    const id = await board([{ definitionId: sharedReport, width: "half" }], admin(), {
      isShared: true,
    });

    await updateDashboard(id, { name: `DB Pano yeni ${TAG}`, tiles: [] }, admin());
    const after = await getDashboard(id, admin());
    expect(after.name).toBe(`DB Pano yeni ${TAG}`);
    expect(after.tiles).toHaveLength(0);

    await expect(
      updateDashboard(id, { name: "olmaz" }, rep()),
    ).rejects.toThrow(/yetkiniz yok/i);
    await expect(deleteDashboard(id, rep())).rejects.toThrow(/yetkiniz yok/i);
  });

  it("drops a tile that no longer parses instead of failing to open", async () => {
    const id = await board([{ definitionId: sharedReport, width: "half" }]);
    // Straight into the column, as a rolled-back version or a hand edit would.
    await prisma.reportDashboard.update({
      where: { id },
      data: { tiles: [{ definitionId: sharedReport }, { nonsense: true }] as never },
    });

    const run = await runDashboard(id, admin());
    expect(run.tiles).toHaveLength(1);
    // The surviving tile still gets the default width rather than nothing.
    expect(run.tiles[0]!.width).toBe("half");
  });
});
