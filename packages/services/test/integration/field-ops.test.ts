import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  createCheckIn,
  checkOut,
  getOpenCheckIn,
  listCheckIns,
} from "../../src/checkin";
import { listPayments, recordPayment, reversePayment } from "../../src/payment";
import { getStatement } from "../../src/ledger";
import { BusinessError } from "../../src/errors";

// Field operations as they now run from the web: money collected at the door
// and visits opened at it. What is worth testing is not that a row appears —
// it is that the cached balance and the ledger say the same thing after every
// path, including the ones that go wrong.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `fo${Date.now()}`;

let groupId: string;
let companyId: string;
let otherCompanyId: string;
let repId: string;
let otherRepId: string;

async function balance(id: string): Promise<string> {
  const c = await prisma.company.findUniqueOrThrow({
    where: { id },
    select: { currentBalance: true },
  });
  return c.currentBalance.toFixed(2);
}

suite("field operations: collection and visits", () => {
  beforeAll(async () => {
    const group = await prisma.customerGroup.create({
      data: { name: `FO Grup ${TAG}` },
    });
    groupId = group.id;

    const rep = await prisma.user.create({
      data: {
        email: `fo-rep-${TAG}@test.local`,
        name: "FO Plasiyer",
        passwordHash: "x",
        role: "SALES_REP",
      },
    });
    repId = rep.id;

    const otherRep = await prisma.user.create({
      data: {
        email: `fo-rep2-${TAG}@test.local`,
        name: "FO Plasiyer 2",
        passwordHash: "x",
        role: "SALES_REP",
      },
    });
    otherRepId = otherRep.id;

    const company = await prisma.company.create({
      data: {
        name: `FO Firma ${TAG}`,
        customerGroupId: groupId,
        creditLimit: 100_000,
        currentBalance: 5_000,
        salesRepId: repId,
      },
    });
    companyId = company.id;

    // The opening balance gets a ledger row of its own. Setting only the cached
    // figure would leave the two out of step from the start, and the test that
    // checks they agree could then never mean anything.
    await prisma.transaction.create({
      data: {
        companyId,
        type: "DEBIT",
        amount: 5_000,
        description: `Devir ${TAG}`,
      },
    });

    const other = await prisma.company.create({
      data: {
        name: `FO Firma 2 ${TAG}`,
        customerGroupId: groupId,
        creditLimit: 100_000,
        currentBalance: 1_000,
      },
    });
    otherCompanyId = other.id;
  });

  afterAll(async () => {
    if (!hasDb) return;
    await prisma.checkIn.deleteMany({
      where: { salesRepId: { in: [repId, otherRepId] } },
    });
    // Çek/senet tahsilatı portföye bir kâğıt açıyor ve o kâğıt tahsilat
    // satırına bağlı; önce kâğıt düşmeden cari hareketleri silinemez.
    await prisma.chequeEvent.deleteMany({
      where: { cheque: { companyId: { in: [companyId, otherCompanyId] } } },
    });
    await prisma.cheque.deleteMany({
      where: { companyId: { in: [companyId, otherCompanyId] } },
    });
    // Reversals point at the collections they undo, so the pointing rows go first.
    await prisma.transaction.deleteMany({
      where: { companyId: { in: [companyId, otherCompanyId] }, reversalOfId: { not: null } },
    });
    await prisma.transaction.deleteMany({
      where: { companyId: { in: [companyId, otherCompanyId] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyId, otherCompanyId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [repId, otherRepId] } } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.$disconnect();
  });

  // ── collection ──

  it("credits the ledger and the cached balance together", async () => {
    const before = await balance(companyId);
    const result = await recordPayment(
      {
        companyId,
        amount: 1_250.5,
        collectionMethod: "CASH",
        description: `Makbuz ${TAG}`,
      },
      repId,
    );

    expect(result.amount).toBe("1250.50");
    expect(result.newBalance).toBe((Number(before) - 1250.5).toFixed(2));
    expect(await balance(companyId)).toBe(result.newBalance);

    const row = await prisma.transaction.findUniqueOrThrow({
      where: { id: result.transactionId },
      select: { type: true, collectionMethod: true, paymentMethod: true },
    });
    expect(row.type).toBe("CREDIT");
    expect(row.collectionMethod).toBe("CASH");
    // The order-side enum stays out of it: a collection is not an order term.
    expect(row.paymentMethod).toBeNull();
  });

  it("lists a company's collections whoever recorded them", async () => {
    await recordPayment(
      { companyId, amount: 100, collectionMethod: "BANK_TRANSFER" },
      otherRepId,
    );

    const byCompany = await listPayments({ kind: "company", companyId });
    expect(byCompany.length).toBeGreaterThanOrEqual(2);
    expect(byCompany.map((p) => p.recordedByName)).toContain("FO Plasiyer 2");

    // The rep's own view is narrower on purpose: it answers "what did I collect".
    const mine = await listPayments({ kind: "recorder", recordedById: otherRepId });
    expect(mine.every((p) => p.recordedByName === "FO Plasiyer 2")).toBe(true);
  });

  it("undoes a collection by writing its opposite, not by deleting it", async () => {
    const before = await balance(companyId);
    const payment = await recordPayment(
      { companyId, amount: 400, collectionMethod: "CHEQUE" },
      repId,
    );

    const reversal = await reversePayment(
      { transactionId: payment.transactionId, companyId, reason: "yanlış tutar" },
      repId,
    );

    expect(reversal.amount).toBe("400.00");
    expect(reversal.newBalance).toBe(before);
    expect(await balance(companyId)).toBe(before);

    // Both rows survive: the ekstre shows the mistake and its correction.
    const original = await prisma.transaction.findUnique({
      where: { id: payment.transactionId },
    });
    expect(original).not.toBeNull();

    const statement = await getStatement(companyId);
    const rows = statement.rows.filter(
      (r) => r.id === payment.transactionId || r.id === reversal.reversalId,
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === reversal.reversalId)!.reversalOfId).toBe(
      payment.transactionId,
    );

    // And the cache still agrees with the ledger it caches.
    expect(statement.closingBalance).toBe(statement.company.currentBalance);
  });

  it("refuses to reverse the same collection twice", async () => {
    const payment = await recordPayment(
      { companyId, amount: 75, collectionMethod: "OTHER" },
      repId,
    );
    await reversePayment(
      { transactionId: payment.transactionId, companyId, reason: "ilk iptal" },
      repId,
    );

    await expect(
      reversePayment(
        { transactionId: payment.transactionId, companyId, reason: "ikinci iptal" },
        repId,
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("will not reverse a collection belonging to another company", async () => {
    const payment = await recordPayment(
      { companyId, amount: 50, collectionMethod: "CASH" },
      repId,
    );

    // Same answer as a non-existent id: authorization must not be probeable.
    await expect(
      reversePayment(
        {
          transactionId: payment.transactionId,
          companyId: otherCompanyId,
          reason: "başka firma",
        },
        repId,
      ),
    ).rejects.toMatchObject({ code: "TRANSACTION_NOT_FOUND" });

    expect(await balance(otherCompanyId)).toBe("1000.00");
  });

  it("rejects reversing a debt row", async () => {
    const debt = await prisma.transaction.create({
      data: { companyId, type: "DEBIT", amount: 10, description: "test borç" },
      select: { id: true },
    });

    await expect(
      reversePayment(
        { transactionId: debt.id, companyId, reason: "olmaz" },
        repId,
      ),
    ).rejects.toBeInstanceOf(BusinessError);
  });

  // ── visits ──

  it("stamps where the visit was recorded, from the caller's channel", async () => {
    const visit = await createCheckIn(
      { companyId, source: "WEB", note: "web ziyareti" },
      repId,
    );
    expect(visit.source).toBe("WEB");
    expect(visit.checkOutAt).toBeNull();

    const open = await getOpenCheckIn(repId);
    expect(open?.id).toBe(visit.id);
  });

  it("refuses a second visit while one is open, and names the open one", async () => {
    await expect(
      createCheckIn({ companyId, source: "WEB" }, repId),
    ).rejects.toMatchObject({ code: "VISIT_ALREADY_OPEN" });

    // Another rep is not blocked by someone else's open visit.
    const other = await createCheckIn(
      { companyId: otherCompanyId, source: "MOBILE" },
      otherRepId,
    );
    expect(other.source).toBe("MOBILE");
    await checkOut(other.id, otherRepId);
  });

  it("frees the rep once the visit is closed", async () => {
    const open = await getOpenCheckIn(repId);
    const closed = await checkOut(open!.id, repId);
    expect(closed.checkOutAt).not.toBeNull();
    expect(await getOpenCheckIn(repId)).toBeNull();

    const next = await createCheckIn({ companyId, source: "MOBILE" }, repId);
    expect(next.id).not.toBe(open!.id);
    await checkOut(next.id, repId);

    const list = await listCheckIns(repId, companyId);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.every((v) => v.companyId === companyId)).toBe(true);
  });

  it("lets only the rep who opened a visit close it", async () => {
    const visit = await createCheckIn({ companyId, source: "WEB" }, repId);
    await expect(checkOut(visit.id, otherRepId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await checkOut(visit.id, repId);
  });
});
