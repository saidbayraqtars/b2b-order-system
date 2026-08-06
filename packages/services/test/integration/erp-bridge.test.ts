import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  authenticateAgent,
  createErpAgent,
  rotateErpAgentToken,
  setErpAgentActive,
} from "../../src/erp-agent";
import {
  getMappingStatus,
  ingestCustomers,
  ingestPrices,
  ingestStock,
  listSyncIssues,
} from "../../src/erp-ingest";

// ERP köprüsü.
//
// Two claims carry this suite, and both are about what the bridge *refuses*:
//
//  * It never creates. The ERP holds 79.829 cari; an import that created them
//    would fill this system with customers nobody chose, each of which can log
//    in and be ordered for.
//  * It never hides a skip. A sync that silently dropped 4.000 rows looks
//    exactly like one that worked, so every unmatched code is kept.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `erp${Date.now()}`;

let groupId: string;
let categoryId: string;
let productId: string;
let mappedVariantId: string;
let unmappedVariantId: string;
let mappedCompanyId: string;
let agentId: string;

const CARI_CODE = `CARI-${TAG}`;
const STOK_CODE = `STOK-${TAG}`;

suite("ERP köprüsü integration", () => {
  beforeAll(async () => {
    const group = await prisma.customerGroup.create({ data: { name: `Grup ${TAG}` } });
    groupId = group.id;

    const category = await prisma.category.create({
      data: { name: `Kategori ${TAG}`, slug: `kat-${TAG}` },
    });
    categoryId = category.id;

    const company = await prisma.company.create({
      data: {
        name: `Firma ${TAG}`,
        creditLimit: 1000,
        customerGroupId: groupId,
        externalCode: CARI_CODE,
      },
    });
    mappedCompanyId = company.id;

    const product = await prisma.product.create({
      data: {
        name: `Ürün ${TAG}`,
        slug: `urun-${TAG}`,
        vatRate: 20,
        categoryId,
        variants: {
          create: [
            { sku: `SKU-M-${TAG}`, externalCode: STOK_CODE, stock: 5 },
            { sku: `SKU-U-${TAG}`, stock: 7 },
          ],
        },
      },
      include: { variants: { orderBy: { sku: "asc" } } },
    });
    productId = product.id;
    mappedVariantId = product.variants.find((v) => v.externalCode === STOK_CODE)!.id;
    unmappedVariantId = product.variants.find((v) => !v.externalCode)!.id;
  });

  afterAll(async () => {
    await prisma.erpSyncIssue.deleteMany({ where: { run: { agentId } } });
    await prisma.erpSyncRun.deleteMany({ where: { agentId } });
    await prisma.erpAgent.deleteMany({ where: { id: agentId } });
    await prisma.price.deleteMany({ where: { variantId: mappedVariantId } });
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.company.deleteMany({ where: { id: mappedCompanyId } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.$disconnect();
  });

  describe("ajan kimliği", () => {
    it("shows the token once and stores only its hash", async () => {
      const issued = await createErpAgent(`Ajan ${TAG}`);
      agentId = issued.id;
      expect(issued.token.length).toBeGreaterThan(30);

      const stored = await prisma.erpAgent.findUniqueOrThrow({
        where: { id: issued.id },
        select: { tokenHash: true, tokenHint: true },
      });
      // A leaked database must not hand over the ability to rewrite stock.
      expect(stored.tokenHash).not.toBe(issued.token);
      expect(stored.tokenHash).toHaveLength(64);
      expect(issued.token.endsWith(stored.tokenHint!)).toBe(true);

      const authed = await authenticateAgent(issued.token);
      expect(authed?.id).toBe(issued.id);
    });

    it("refuses a disabled agent the same way it refuses an unknown one", async () => {
      const issued = await rotateErpAgentToken(agentId);
      await setErpAgentActive(agentId, false);

      // Both null: telling the caller which it was would confirm to whoever
      // holds a revoked token that it used to be real.
      expect(await authenticateAgent(issued.token)).toBeNull();
      expect(await authenticateAgent("kesinlikle-boyle-bir-token-yok")).toBeNull();

      await setErpAgentActive(agentId, true);
      expect((await authenticateAgent(issued.token))?.id).toBe(agentId);
    });

    it("kills the old token the moment a new one is issued", async () => {
      const first = await rotateErpAgentToken(agentId);
      const second = await rotateErpAgentToken(agentId);

      // No grace period: rotation happens because something leaked.
      expect(await authenticateAgent(first.token)).toBeNull();
      expect((await authenticateAgent(second.token))?.id).toBe(agentId);
    });

    it("records where it last called from", async () => {
      const issued = await rotateErpAgentToken(agentId);
      await authenticateAgent(issued.token, { ip: "10.0.0.9" });

      const row = await prisma.erpAgent.findUniqueOrThrow({
        where: { id: agentId },
        select: { lastSeenAt: true, lastSeenIp: true },
      });
      expect(row.lastSeenIp).toBe("10.0.0.9");
      expect(row.lastSeenAt).not.toBeNull();
    });
  });

  describe("cari", () => {
    it("updates the mapped one and keeps the code of the one it could not place", async () => {
      const result = await ingestCustomers(
        [
          { code: CARI_CODE, name: `Firma ${TAG} (ERP)`, taxNumber: `9${TAG.slice(-9)}`, balance: 1234.56 },
          { code: `YOK-${TAG}`, name: "Eşleşmeyen Cari" },
        ],
        agentId,
      );

      expect(result.received).toBe(2);
      expect(result.applied).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.status).toBe("PARTIAL");

      // Nothing was created — that is the whole rule.
      const invented = await prisma.company.findFirst({
        where: { externalCode: `YOK-${TAG}` },
      });
      expect(invented).toBeNull();

      const issues = await listSyncIssues(result.runId);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.externalCode).toBe(`YOK-${TAG}`);
      expect(issues[0]!.label).toBe("Eşleşmeyen Cari");
    });

    it("puts the ERP balance beside ours, never over it", async () => {
      const company = await prisma.company.findUniqueOrThrow({
        where: { id: mappedCompanyId },
        select: { currentBalance: true, erpBalance: true, erpSyncedAt: true, name: true },
      });

      expect(Number(company.erpBalance)).toBeCloseTo(1234.56, 2);
      // Ours is derived from our own Transaction ledger and every screen adds
      // up against it. Overwriting it would make the balance disagree with the
      // ekstre printed next to it.
      expect(Number(company.currentBalance)).toBe(0);
      expect(company.erpSyncedAt).not.toBeNull();
      expect(company.name).toBe(`Firma ${TAG} (ERP)`);
    });
  });

  describe("stok", () => {
    it("takes the ERP figure and clamps a negative one", async () => {
      const result = await ingestStock([{ code: STOK_CODE, quantity: -3 }], agentId);
      expect(result.applied).toBe(1);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: mappedVariantId },
        select: { stock: true, erpSyncedAt: true },
      });
      // A catalogue showing "-3 adet" helps nobody; why the ERP went negative
      // is the ERP's business.
      expect(variant.stock).toBe(0);
      expect(variant.erpSyncedAt).not.toBeNull();
    });

    it("leaves an unmapped variant completely alone", async () => {
      await ingestStock([{ code: STOK_CODE, quantity: 42 }], agentId);

      const untouched = await prisma.productVariant.findUniqueOrThrow({
        where: { id: unmappedVariantId },
        select: { stock: true, erpSyncedAt: true },
      });
      expect(untouched.stock).toBe(7);
      expect(untouched.erpSyncedAt).toBeNull();

      const mapped = await prisma.productVariant.findUniqueOrThrow({
        where: { id: mappedVariantId },
        select: { stock: true },
      });
      expect(mapped.stock).toBe(42);
    });
  });

  describe("fiyat", () => {
    it("writes a tier once and overwrites it on the next run", async () => {
      await ingestPrices([{ code: STOK_CODE, price: 100, minQuantity: 1 }], agentId);
      await ingestPrices([{ code: STOK_CODE, price: 125, minQuantity: 1 }], agentId);

      // Re-running must overwrite, not accumulate — otherwise a nightly sync
      // would leave a hundred rows for the same tier.
      const prices = await prisma.price.findMany({
        where: { variantId: mappedVariantId, customerGroupId: null, minQuantity: 1 },
      });
      expect(prices).toHaveLength(1);
      expect(Number(prices[0]!.price)).toBeCloseTo(125, 2);
    });

    it("refuses to invent a customer group", async () => {
      const result = await ingestPrices(
        [{ code: STOK_CODE, price: 90, customerGroupCode: `Olmayan ${TAG}` }],
        agentId,
      );

      // Groups decide who is charged what; creating one from an import would
      // quietly change a customer's price.
      expect(result.applied).toBe(0);
      expect(result.skipped).toBe(1);
      const invented = await prisma.customerGroup.findFirst({
        where: { name: `Olmayan ${TAG}` },
      });
      expect(invented).toBeNull();
    });

    it("matches an existing group by name", async () => {
      const result = await ingestPrices(
        [{ code: STOK_CODE, price: 80, customerGroupCode: `Grup ${TAG}` }],
        agentId,
      );
      expect(result.applied).toBe(1);

      const price = await prisma.price.findFirstOrThrow({
        where: { variantId: mappedVariantId, customerGroupId: groupId },
      });
      expect(Number(price.price)).toBeCloseTo(80, 2);
    });
  });

  describe("eşleme durumu", () => {
    it("counts what is mapped, which is the question the screen opens on", async () => {
      const status = await getMappingStatus();
      expect(status.companies.mapped).toBeGreaterThan(0);
      expect(status.companies.total).toBeGreaterThanOrEqual(status.companies.mapped);
      expect(status.variants.total).toBeGreaterThanOrEqual(status.variants.mapped);
      expect(status.lastRuns.some((r) => r.kind === "STOCK")).toBe(true);
    });
  });
});
