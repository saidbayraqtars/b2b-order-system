import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { GET as getPayments, POST as postPayment } from "@/app/api/payments/route";
import { POST as reversePayment } from "@/app/api/payments/[id]/reverse/route";
import { GET as getCheckins, POST as postCheckin } from "@/app/api/checkins/route";
import { POST as postCheckout } from "@/app/api/checkins/[id]/checkout/route";
import { GET as getStatement } from "@/app/api/companies/[id]/statement/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Money taken at the customer's door and visits opened there — the two things
// the field app writes. Both were only ever exercised from the service layer;
// what the endpoints add is a channel (a visit knows whether it was opened on a
// phone or in the office) and a replay guard (the phone retries when the
// network drops).

const fx = new Fixtures("field");
const suite = hasDb ? describe : describe.skip;

let rep: TestUser;
let admin: TestUser;
let companyId: string;

suite("saha: tahsilat ve ziyaret (HTTP)", () => {
  beforeAll(async () => {
    rep = await fx.user("SALES_REP");
    admin = await fx.user("SUPER_ADMIN");
    const groupId = await fx.group();
    companyId = await fx.company({
      customerGroupId: groupId,
      salesRepId: rep.id,
      currentBalance: 0,
    });
  });

  afterAll(() => fx.teardown());

  describe("tahsilat", () => {
    it("tahsilat cari bakiyeyi düşürür", async () => {
      await debit(companyId, 1_000);
      const before = await balanceOf(companyId);

      const res = await callRoute(postPayment, {
        url: "/api/payments",
        method: "POST",
        body: { companyId, amount: 400, collectionMethod: "CASH" },
        token: await bearer(rep),
      });
      expect(res.status).toBe(201);
      expect(await balanceOf(companyId)).toBe(before - 400);
    });

    it("aynı tekrar anahtarı ikinci bir tahsilat yazmaz", async () => {
      // Ağ koptuğunda telefon isteği tekrar gönderiyor. Ekrandaki onay adımı
      // bunu durdurmuyordu; durduran şey sunucudaki anahtar.
      const key = `key-${fx.tag}-tekrar`;
      const before = await balanceOf(companyId);

      const first = await callRoute(postPayment, {
        url: "/api/payments",
        method: "POST",
        body: {
          companyId,
          amount: 100,
          collectionMethod: "CASH",
          idempotencyKey: key,
        },
        token: await bearer(rep),
      });
      const second = await callRoute(postPayment, {
        url: "/api/payments",
        method: "POST",
        body: {
          companyId,
          amount: 100,
          collectionMethod: "CASH",
          idempotencyKey: key,
        },
        token: await bearer(rep),
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.transactionId).toBe(first.body.transactionId);
      expect(await balanceOf(companyId)).toBe(before - 100);
    });

    it("sıfır ya da eksi tutar reddedilir", async () => {
      for (const amount of [0, -50]) {
        const res = await callRoute(postPayment, {
          url: "/api/payments",
          method: "POST",
          body: { companyId, amount, collectionMethod: "CASH" },
          token: await bearer(rep),
        });
        expect(res.status, `tutar ${amount}`).toBe(400);
      }
    });

    it("iptal silmez, ters kayıt yazar", async () => {
      const before = await balanceOf(companyId);
      const collected = await callRoute(postPayment, {
        url: "/api/payments",
        method: "POST",
        body: { companyId, amount: 250, collectionMethod: "CASH" },
        token: await bearer(rep),
      });
      const transactionId = collected.body.transactionId;

      const res = await callRoute(reversePayment, {
        url: `/api/payments/${transactionId}/reverse`,
        method: "POST",
        params: { id: transactionId },
        body: { companyId, reason: "yanlış müşteri" },
        token: await bearer(rep),
      });
      expect(res.status).toBe(201);
      expect(await balanceOf(companyId)).toBe(before);

      // İki satır da ekstrede durur — muhasebecinin mutabakatta gördüğü şey bu.
      const statement = await callRoute(getStatement, {
        url: `/api/companies/${companyId}/statement`,
        params: { id: companyId },
        token: await bearer(rep),
      });
      const rows = statement.body.rows as Array<{
        id: string;
        reversalOfId: string | null;
      }>;
      expect(rows.map((r) => r.id)).toContain(transactionId);
      expect(rows.some((r) => r.reversalOfId === transactionId)).toBe(true);
    });

    it("gerekçesiz iptal olmaz", async () => {
      const collected = await callRoute(postPayment, {
        url: "/api/payments",
        method: "POST",
        body: { companyId, amount: 10, collectionMethod: "CASH" },
        token: await bearer(rep),
      });
      const res = await callRoute(reversePayment, {
        url: `/api/payments/${collected.body.transactionId}/reverse`,
        method: "POST",
        params: { id: collected.body.transactionId },
        body: { companyId, reason: "" },
        token: await bearer(rep),
      });
      expect(res.status).toBe(400);
    });

    it("aynı tahsilat iki kez iptal edilemez", async () => {
      const collected = await callRoute(postPayment, {
        url: "/api/payments",
        method: "POST",
        body: { companyId, amount: 60, collectionMethod: "CASH" },
        token: await bearer(rep),
      });
      const id = collected.body.transactionId;
      const body = { companyId, reason: "çift iptal denemesi" };

      const first = await callRoute(reversePayment, {
        url: `/api/payments/${id}/reverse`,
        method: "POST",
        params: { id },
        body,
        token: await bearer(rep),
      });
      const second = await callRoute(reversePayment, {
        url: `/api/payments/${id}/reverse`,
        method: "POST",
        params: { id },
        body,
        token: await bearer(rep),
      });

      expect(first.status).toBe(201);
      expect(second.status).toBeGreaterThanOrEqual(400);
    });

    it("uydurulmuş hareket kimliği bir yere varmaz", async () => {
      const res = await callRoute(reversePayment, {
        url: "/api/payments/cly000000000000000000000/reverse",
        method: "POST",
        params: { id: "cly000000000000000000000" },
        body: { companyId, reason: "olmayan kayıt" },
        token: await bearer(rep),
      });
      expect(res.status).toBe(404);
    });

    it("firma verilen liste o firmanın bütün tahsilatlarını gösterir", async () => {
      // Kapıda para isteyecek plasiyer, ofisin girdiği tahsilatı da görmeli.
      const fromOffice = await callRoute(postPayment, {
        url: "/api/payments",
        method: "POST",
        body: { companyId, amount: 15, collectionMethod: "BANK_TRANSFER" },
        token: await bearer(admin),
      });
      expect(fromOffice.status).toBe(201);

      const res = await callRoute(getPayments, {
        url: `/api/payments?companyId=${companyId}`,
        token: await bearer(rep),
      });
      expect(res.status).toBe(200);
      const recorders = new Set(
        res.body.payments.map((p: { recordedByName: string | null }) => p.recordedByName),
      );
      expect(recorders).toContain(rep.name);
      expect(recorders).toContain(admin.name);
    });
  });

  describe("ziyaret", () => {
    it("telefondan açılan ziyaret MOBILE, tarayıcıdan açılan WEB kaydedilir", async () => {
      // Kaynağı istemci söyleyemez: taşıdığı kimlik söylüyor. İstemcinin
      // gönderdiği bir \"source\" alanı hiçbir şey ifade etmezdi.
      const fromPhone = await callRoute(postCheckin, {
        url: "/api/checkins",
        method: "POST",
        body: { companyId, latitude: 41.01, longitude: 28.97 },
        token: await bearer(rep),
      });
      expect(fromPhone.status).toBe(201);
      expect(fromPhone.body.checkIn.source).toBe("MOBILE");

      await callRoute(postCheckout, {
        url: `/api/checkins/${fromPhone.body.checkIn.id}/checkout`,
        method: "POST",
        params: { id: fromPhone.body.checkIn.id },
        token: await bearer(rep),
      });

      const fromDesk = await callRoute(postCheckin, {
        url: "/api/checkins",
        method: "POST",
        body: { companyId },
        session: {
          user: {
            id: rep.id,
            email: rep.email,
            name: rep.name,
            role: rep.role,
            companyId: rep.companyId,
            tokenVersion: rep.tokenVersion,
          },
        },
      });
      expect(fromDesk.status).toBe(201);
      expect(fromDesk.body.checkIn.source).toBe("WEB");
    });

    it("açık ziyaret varken ikincisi açılmaz", async () => {
      const res = await callRoute(postCheckin, {
        url: "/api/checkins",
        method: "POST",
        body: { companyId },
        token: await bearer(rep),
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("VISIT_ALREADY_OPEN");
    });

    it("açık ziyaret listeyle birlikte döner", async () => {
      const res = await callRoute(getCheckins, {
        url: `/api/checkins?companyId=${companyId}`,
        token: await bearer(rep),
      });
      expect(res.status).toBe(200);
      expect(res.body.open).not.toBeNull();
      expect(res.body.checkIns.length).toBeGreaterThan(0);
    });

    it("başkasının ziyaretini kapatamaz", async () => {
      const open = await prisma.checkIn.findFirstOrThrow({
        where: { companyId, checkOutAt: null },
        select: { id: true },
      });
      const stranger = await fx.user("SALES_REP", { label: "yabanciplasiyer" });

      const res = await callRoute(postCheckout, {
        url: `/api/checkins/${open.id}/checkout`,
        method: "POST",
        params: { id: open.id },
        token: await bearer(stranger),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);

      const still = await prisma.checkIn.findUniqueOrThrow({
        where: { id: open.id },
        select: { checkOutAt: true },
      });
      expect(still.checkOutAt).toBeNull();
    });

    it("kendi ziyaretini kapatır", async () => {
      const open = await prisma.checkIn.findFirstOrThrow({
        where: { companyId, salesRepId: rep.id, checkOutAt: null },
        select: { id: true },
      });
      const res = await callRoute(postCheckout, {
        url: `/api/checkins/${open.id}/checkout`,
        method: "POST",
        params: { id: open.id },
        token: await bearer(rep),
      });
      expect(res.status).toBe(200);
      expect(res.body.checkIn.checkOutAt).not.toBeNull();
    });
  });
});

async function balanceOf(id: string): Promise<number> {
  const c = await prisma.company.findUniqueOrThrow({
    where: { id },
    select: { currentBalance: true },
  });
  return Number(c.currentBalance);
}

/** An opening debt, ledger row included — a balance with no entry behind it
 *  would make the "these two agree" assertions meaningless. */
async function debit(id: string, amount: number): Promise<void> {
  await prisma.$transaction([
    prisma.transaction.create({
      data: { companyId: id, type: "DEBIT", amount, description: "Devir" },
    }),
    prisma.company.update({
      where: { id },
      data: { currentBalance: { increment: amount } },
    }),
  ]);
}
