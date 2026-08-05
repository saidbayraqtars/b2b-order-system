import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import {
  MAX_FAILURES_PER_IP,
  checkIpThrottle,
} from "../../src/rate-limit";
import { attemptLogin, checkPrincipal, revokeSessions } from "../../src/security";
import {
  clearPrincipalCache,
  principalCacheStats,
} from "../../src/principal-cache";
import { auditStats, exportAuditCsv, purgeAuditLogs } from "../../src/audit-retention";
import { listActivity } from "../../src/activity";
import { createOrder } from "../../src/order";
import { updateUser } from "../../src/user-admin";

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `sh${Date.now()}`;
const PASSWORD = "Password123!";
const IP = `10.9.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;

let companyId: string;
let otherCompanyId: string;
let userId: string;
let repId: string;
let adminId: string;
let categoryId: string;
let productId: string;
let variantId: string;

suite("security hardening", () => {
  beforeAll(async () => {
    const rep = await prisma.user.create({
      data: {
        email: `sh-rep-${TAG}@test.local`,
        name: "SH Plasiyer",
        passwordHash: "x",
        role: "SALES_REP",
      },
    });
    repId = rep.id;

    const company = await prisma.company.create({
      data: { name: `SH Firma ${TAG}`, creditLimit: 10_000_000, salesRepId: repId },
    });
    companyId = company.id;
    const other = await prisma.company.create({
      data: { name: `SH Diğer ${TAG}`, creditLimit: 10_000_000 },
    });
    otherCompanyId = other.id;

    const user = await prisma.user.create({
      data: {
        email: `sh-user-${TAG}@test.local`,
        name: "SH Alıcı",
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: "COMPANY_ADMIN",
        companyId,
      },
    });
    userId = user.id;

    const admin = await prisma.user.create({
      data: {
        email: `sh-admin-${TAG}@test.local`,
        name: "SH Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;

    const category = await prisma.category.create({
      data: { name: `SH Kategori ${TAG}`, slug: `sh-kat-${TAG}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        name: `SH Ürün ${TAG}`,
        slug: `sh-urun-${TAG}`,
        vatRate: 20,
        categoryId,
        variants: { create: [{ sku: `SH-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 1000 }] },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0]!.id;
    await prisma.price.create({ data: { variantId, minQuantity: 1, price: 50 } });
  });

  beforeEach(async () => {
    clearPrincipalCache();
    await prisma.auditLog.deleteMany({ where: { ip: IP } });
  });

  afterEach(() => {
    clearPrincipalCache();
  });

  afterAll(async () => {
    if (!hasDb) return;
    const orders = await prisma.order.findMany({
      where: { companyId: { in: [companyId, otherCompanyId] } },
      select: { id: true },
    });
    await prisma.transaction.deleteMany({
      where: { companyId: { in: [companyId, otherCompanyId] } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    await prisma.auditLog.deleteMany({
      where: { OR: [{ ip: IP }, { actorId: { in: [userId, repId, adminId] } }] },
    });
    await prisma.price.deleteMany({ where: { variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, repId, adminId] } } });
    await prisma.company.deleteMany({
      where: { id: { in: [companyId, otherCompanyId] } },
    });
    await prisma.$disconnect();
  });

  describe("per-address login throttle", () => {
    const email = () => `sh-user-${TAG}@test.local`;

    it("lets a normal wrong password through to the account lockout", async () => {
      const result = await attemptLogin(email(), "wrong", { ip: IP });
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ reason: "INVALID" });
    });

    it("blocks an address that has been spraying, before touching a password", async () => {
      // Spraying looks like this: one attempt each against many addresses, so
      // no single account ever reaches its own lockout.
      const rows = Array.from({ length: MAX_FAILURES_PER_IP }, (_, i) => ({
        actorEmail: `victim${i}-${TAG}@test.local`,
        action: "LOGIN_FAILED" as const,
        summary: "test",
        ip: IP,
      }));
      await prisma.auditLog.createMany({ data: rows });

      const state = await checkIpThrottle(IP);
      expect(state.blocked).toBe(true);
      expect(state.retryAt).toBeInstanceOf(Date);

      // Even the *correct* password is refused while the address is blocked.
      const result = await attemptLogin(email(), PASSWORD, { ip: IP });
      expect(result).toMatchObject({ reason: "IP_BLOCKED" });
    });

    it("counts only failures inside the window", async () => {
      const old = new Date(Date.now() - 60 * 60_000);
      await prisma.auditLog.createMany({
        data: Array.from({ length: MAX_FAILURES_PER_IP + 5 }, () => ({
          actorEmail: `stale-${TAG}@test.local`,
          action: "LOGIN_FAILED" as const,
          summary: "test",
          ip: IP,
          createdAt: old,
        })),
      });
      expect((await checkIpThrottle(IP)).blocked).toBe(false);
    });

    it("does not throttle a request with no address", async () => {
      await prisma.auditLog.createMany({
        data: Array.from({ length: MAX_FAILURES_PER_IP + 5 }, () => ({
          actorEmail: `x-${TAG}@test.local`,
          action: "LOGIN_FAILED" as const,
          summary: "test",
          ip: IP,
        })),
      });
      // Throttling "unknown" would put every proxied client in one bucket.
      expect((await checkIpThrottle(null)).blocked).toBe(false);
    });
  });

  describe("principal cache", () => {
    it("serves the second read from memory", async () => {
      await checkPrincipal(userId, 0);
      const before = principalCacheStats();
      await checkPrincipal(userId, 0);
      const after = principalCacheStats();
      expect(after.hits).toBe(before.hits + 1);
    });

    it("does not let a revoked session survive the cache", async () => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { tokenVersion: true },
      });

      // Warm it, so a stale entry would exist if eviction did not happen.
      expect((await checkPrincipal(userId, user.tokenVersion)).rejection).toBeNull();

      await revokeSessions(userId);

      const check = await checkPrincipal(userId, user.tokenVersion);
      expect(check.rejection).toBe("STALE");
    });

    it("does not let a deactivated account survive the cache either", async () => {
      const current = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { tokenVersion: true },
      });
      await checkPrincipal(userId, current.tokenVersion);

      await updateUser(
        userId,
        { isActive: false },
        { userId: adminId, email: `sh-admin-${TAG}@test.local`, role: "SUPER_ADMIN" },
      );

      const check = await checkPrincipal(userId, current.tokenVersion);
      // Deactivating also bumps tokenVersion, so either rejection proves the
      // stale row is gone; what must not happen is `null`.
      expect(check.rejection).not.toBeNull();

      await updateUser(
        userId,
        { isActive: true },
        { userId: adminId, email: `sh-admin-${TAG}@test.local`, role: "SUPER_ADMIN" },
      );
    });
  });

  describe("audit retention and export", () => {
    it("reports what the trail holds", async () => {
      const stats = await auditStats(365);
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.retentionDays).toBe(365);
      expect(stats.newest).not.toBeNull();
    });

    it("deletes old entries, keeps the exempt ones, and records the deletion", async () => {
      const old = new Date(Date.now() - 400 * 24 * 60 * 60_000);
      await prisma.auditLog.createMany({
        data: [
          {
            actorEmail: `purge-a-${TAG}@test.local`,
            action: "PROFILE_UPDATED",
            summary: "eski profil",
            createdAt: old,
          },
          {
            actorEmail: `purge-b-${TAG}@test.local`,
            action: "LOGIN_FAILED",
            summary: "eski güvenlik",
            createdAt: old,
          },
        ],
      });

      const before = new Date(Date.now() - 365 * 24 * 60 * 60_000);
      const result = await purgeAuditLogs({
        before,
        keepActions: ["LOGIN_FAILED"],
        actor: { id: adminId, email: `sh-admin-${TAG}@test.local`, role: "SUPER_ADMIN" },
      });
      expect(result.deleted).toBeGreaterThanOrEqual(1);

      expect(
        await prisma.auditLog.count({
          where: { actorEmail: `purge-a-${TAG}@test.local` },
        }),
      ).toBe(0);
      expect(
        await prisma.auditLog.count({
          where: { actorEmail: `purge-b-${TAG}@test.local` },
        }),
      ).toBe(1);

      // The hole in the trail has to be explained by the trail.
      const note = await prisma.auditLog.findFirst({
        where: { action: "AUDIT_PURGED" },
        orderBy: { createdAt: "desc" },
      });
      expect(note).not.toBeNull();

      await prisma.auditLog.deleteMany({
        where: { actorEmail: `purge-b-${TAG}@test.local` },
      });
    });

    it("exports CSV with a header and neutralised formulas", async () => {
      await prisma.auditLog.create({
        data: {
          actorEmail: `csv-${TAG}@test.local`,
          action: "PROFILE_UPDATED",
          // A summary starting with "=" would run as a formula in Excel.
          summary: `=HYPERLINK("http://evil","tık")`,
          ip: "203.0.113.9",
        },
      });

      let csv = "";
      for await (const chunk of exportAuditCsv({
        from: new Date(Date.now() - 60_000),
      })) {
        csv += chunk;
      }

      expect(csv.split("\n")[0]).toContain("Tarih;İşlem");
      expect(csv).toContain(`"'=HYPERLINK`);
      expect(csv).toContain("203.0.113.9");

      await prisma.auditLog.deleteMany({
        where: { actorEmail: `csv-${TAG}@test.local` },
      });
    });
  });

  describe("unified activity stream", () => {
    beforeAll(async () => {
      await createOrder(
        {
          companyId,
          paymentMethod: "OPEN_ACCOUNT",
          items: [{ variantId, quantity: 4 }],
        },
        { createdById: userId, createdByRole: "COMPANY_ADMIN" },
      );
    });

    it("merges order history and the ledger into one timeline", async () => {
      const entries = await listActivity({
        userId: adminId,
        role: "SUPER_ADMIN",
        companyId: null,
      }, { companyId, limit: 50 });

      const kinds = new Set(entries.map((e) => e.kind));
      expect(kinds.has("ORDER_STATUS")).toBe(true);
      expect(kinds.has("LEDGER")).toBe(true);

      // Newest first, without exception.
      const times = entries.map((e) => e.at);
      expect([...times].sort().reverse()).toEqual(times);
    });

    it("keeps the audit trail out of a non-administrator's stream", async () => {
      const repView = await listActivity({
        userId: repId,
        role: "SALES_REP",
        companyId: null,
      }, { limit: 50 });

      expect(repView.every((e) => e.kind !== "AUDIT")).toBe(true);
      // And only their own portfolio.
      expect(
        repView.every((e) => e.companyId === null || e.companyId === companyId),
      ).toBe(true);
    });

    it("gives a company user nothing from another company", async () => {
      const view = await listActivity({
        userId: userId,
        role: "COMPANY_ADMIN",
        companyId,
      }, { companyId: otherCompanyId, limit: 50 });
      expect(view).toEqual([]);
    });
  });
});
