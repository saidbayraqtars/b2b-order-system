import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { createCashAccount } from "../../src/cash";
import {
  advanceCheque,
  getCheque,
  getChequeSummary,
  listCheques,
  updateChequeDetails,
} from "../../src/cheque";
import { recordPayment, reversePayment } from "../../src/payment";

// Çek/senet portföyü gerçek veritabanına karşı.
//
// Kanıtlanması gereken iddia şu: çekle yapılan tahsilat cariyi kapatır ama
// kasaya girmez; para **vadesinde** girer; karşılıksız çıkarsa kapanan borç
// geri açılır. Üçü de iki defteri birden ilgilendiriyor ve yalnızca gerçek bir
// veritabanında sınanabilir.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `chq${Date.now()}`;

let companyId: string;
let adminId: string;
let bankId: string;

async function balanceOfCompany(): Promise<number> {
  const row = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { currentBalance: true },
  });
  return Number(row.currentBalance);
}

async function balanceOfAccount(id: string): Promise<number> {
  const row = await prisma.cashAccount.findUniqueOrThrow({
    where: { id },
    select: { currentBalance: true },
  });
  return Number(row.currentBalance);
}

/** Bir çek tahsilatı aç ve doğan kâğıdın kimliğini döndür. */
async function collectCheque(amount: number, dueDate?: Date) {
  const result = await recordPayment(
    {
      companyId,
      amount,
      collectionMethod: "CHEQUE",
      ...(dueDate ? { cheque: { dueDate, serialNumber: `S-${amount}` } } : {}),
    },
    adminId,
  );
  return result;
}

suite("çek/senet portföyü integration", () => {
  beforeAll(async () => {
    const company = await prisma.company.create({
      data: { name: `Firma ${TAG}`, creditLimit: 10_000_000 },
    });
    companyId = company.id;

    const admin = await prisma.user.create({
      data: {
        email: `admin-${TAG}@test.local`,
        name: "Çek Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;

    bankId = await createCashAccount({ name: `Banka ${TAG}`, kind: "BANK" });
  });

  afterAll(async () => {
    await prisma.chequeEvent.deleteMany({
      where: { cheque: { companyId } },
    });
    await prisma.cheque.deleteMany({ where: { companyId } });
    await prisma.cashMovement.deleteMany({ where: { accountId: bankId } });
    await prisma.transaction.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.cashAccount.deleteMany({ where: { id: bankId } });
    await prisma.$disconnect();
  });

  describe("tahsilattan doğuş", () => {
    it("çek tahsilatı cariyi kapatır ama kasaya girmez", async () => {
      const before = await balanceOfCompany();
      const bankBefore = await balanceOfAccount(bankId);

      const result = await collectCheque(1000, new Date("2026-09-15"));

      expect(result.chequeId).not.toBeNull();
      // Kasa hareketi yok: kâğıt henüz para değil.
      expect(result.cashMovementId).toBeNull();
      expect(await balanceOfCompany()).toBeCloseTo(before - 1000, 2);
      expect(await balanceOfAccount(bankId)).toBeCloseTo(bankBefore, 2);
    });

    it("nakit tahsilat kâğıt açmaz", async () => {
      const result = await recordPayment(
        { companyId, amount: 50, collectionMethod: "CASH" },
        adminId,
      );
      expect(result.chequeId).toBeNull();
    });

    it("künyesi eksik gelen kâğıt eksik işaretlenir", async () => {
      const { chequeId } = await recordPayment(
        { companyId, amount: 75, collectionMethod: "PROMISSORY_NOTE" },
        adminId,
      );
      const cheque = await getCheque(chequeId!);
      expect(cheque?.kind).toBe("PROMISSORY_NOTE");
      expect(cheque?.dueDate).toBeNull();
      // Sahadan yalnızca tutar geliyor; vadesi girilmemiş kâğıt ekranda
      // uyarıyla duruyor, kaydı reddedilmiyor.
      expect(cheque?.isIncomplete).toBe(true);
    });

    it("ofis künyeyi sonradan tamamlayabilir", async () => {
      const { chequeId } = await collectCheque(120);
      await updateChequeDetails(
        chequeId!,
        { bankName: "Ziraat", dueDate: new Date("2026-10-01"), serialNumber: "A-1" },
        adminId,
      );
      const cheque = await getCheque(chequeId!);
      expect(cheque?.bankName).toBe("Ziraat");
      expect(cheque?.isIncomplete).toBe(false);
    });
  });

  describe("tahsil", () => {
    it("para kasaya kâğıdın tahsilinde girer, tahsilatta değil", async () => {
      const { chequeId } = await collectCheque(500, new Date("2026-09-01"));
      const bankBefore = await balanceOfAccount(bankId);

      const result = await advanceCheque(
        chequeId!,
        { status: "CLEARED", cashAccountId: bankId },
        adminId,
      );

      expect(result.cashMovementId).not.toBeNull();
      expect(await balanceOfAccount(bankId)).toBeCloseTo(bankBefore + 500, 2);

      const movement = await prisma.cashMovement.findUniqueOrThrow({
        where: { id: result.cashMovementId! },
        select: { source: true, direction: true },
      });
      // Kendi kaynağı: gün sonu "bugün gelen para" ile "bugün kapanan borç"u
      // aynı satırda göstermemeli.
      expect(movement.source).toBe("CHEQUE");
      expect(movement.direction).toBe("IN");
    });

    it("tahsil edilmiş kâğıt bir daha hareket etmez", async () => {
      const { chequeId } = await collectCheque(200, new Date("2026-09-02"));
      await advanceCheque(chequeId!, { status: "CLEARED", cashAccountId: bankId }, adminId);

      await expect(
        advanceCheque(chequeId!, { status: "BOUNCED" }, adminId),
      ).rejects.toMatchObject({ code: "INVALID_CHEQUE_TRANSITION" });
    });

    it("tahsile verilen kâğıt portföye geri alınabilir", async () => {
      const { chequeId } = await collectCheque(300, new Date("2026-09-03"));
      await advanceCheque(chequeId!, { status: "DEPOSITED" }, adminId);
      const back = await advanceCheque(chequeId!, { status: "PORTFOLIO" }, adminId);
      expect(back.status).toBe("PORTFOLIO");
      // Banka kâğıdı iade etti; hiçbir deftere yazılmadı.
      expect(back.cashMovementId).toBeNull();
      expect(back.reopenTransactionId).toBeNull();
    });
  });

  describe("karşılıksız ve iade", () => {
    it("karşılıksız çıkan çek kapanan borcu geri açar", async () => {
      const { chequeId } = await collectCheque(400, new Date("2026-09-04"));
      const afterCollection = await balanceOfCompany();

      const result = await advanceCheque(chequeId!, { status: "BOUNCED" }, adminId);

      expect(result.reopenTransactionId).not.toBeNull();
      expect(await balanceOfCompany()).toBeCloseTo(afterCollection + 400, 2);

      // Tahsilat kaydı silinmiyor: o tahsilat gerçekten yapılmıştı. Ekstrede
      // hem kapanış hem geri açılış görünür.
      const rows = await prisma.transaction.findMany({
        where: { companyId, amount: 400 },
        select: { type: true },
      });
      expect(rows.map((r) => r.type).sort()).toEqual(["CREDIT", "DEBIT"]);
    });

    it("müşteriye iade de borcu geri açar", async () => {
      const { chequeId } = await collectCheque(150, new Date("2026-09-05"));
      const afterCollection = await balanceOfCompany();
      await advanceCheque(chequeId!, { status: "RETURNED" }, adminId);
      expect(await balanceOfCompany()).toBeCloseTo(afterCollection + 150, 2);
    });

    it("ciro borcu geri açmaz ve kasaya para koymaz", async () => {
      const { chequeId } = await collectCheque(250, new Date("2026-09-06"));
      const balanceBefore = await balanceOfCompany();
      const bankBefore = await balanceOfAccount(bankId);

      const result = await advanceCheque(
        chequeId!,
        { status: "ENDORSED", endorsedTo: "Tedarikçi A.Ş." },
        adminId,
      );

      expect(result.reopenTransactionId).toBeNull();
      expect(result.cashMovementId).toBeNull();
      expect(await balanceOfCompany()).toBeCloseTo(balanceBefore, 2);
      expect(await balanceOfAccount(bankId)).toBeCloseTo(bankBefore, 2);
    });
  });

  describe("tahsilat iptaliyle ilişki", () => {
    it("portföydeki kâğıt tahsilat iptalinde düşer", async () => {
      const { transactionId, chequeId } = await collectCheque(90, new Date("2026-09-07"));
      await reversePayment(
        { transactionId, companyId, reason: "yanlış tutar" },
        adminId,
      );
      const cheque = await getCheque(chequeId!);
      // Silinmiyor: portföyden çıkan kâğıdın izi kalmalı.
      expect(cheque?.status).toBe("CANCELLED");
    });

    it("tahsil edilmiş kâğıdın tahsilatı iptal edilemez", async () => {
      const { transactionId, chequeId } = await collectCheque(60, new Date("2026-09-08"));
      await advanceCheque(chequeId!, { status: "CLEARED", cashAccountId: bankId }, adminId);

      // Para kasaya girdi; tahsilatı iptal etmek onu defterde yok saymak olurdu.
      await expect(
        reversePayment({ transactionId, companyId, reason: "deneme" }, adminId),
      ).rejects.toMatchObject({ code: "CHEQUE_ALREADY_SETTLED" });
    });
  });

  describe("liste ve özet", () => {
    it("vadesi geçmiş kâğıtları ayırır", async () => {
      const past = new Date(Date.now() - 5 * 86_400_000);
      const { chequeId } = await collectCheque(333, past);

      const overdue = await listCheques({ overdueOnly: true, companyId });
      expect(overdue.some((c) => c.id === chequeId)).toBe(true);
      expect(overdue.find((c) => c.id === chequeId)?.isOverdue).toBe(true);
    });

    it("özet elimizdekini ve vadesi geçeni sayar", async () => {
      const summary = await getChequeSummary();
      expect(Number(summary.openTotal)).toBeGreaterThan(0);
      expect(summary.overdueCount).toBeGreaterThan(0);
      expect(summary.byStatus.length).toBeGreaterThan(0);
    });

    it("geçmiş her adımı kaydeder", async () => {
      const { chequeId } = await collectCheque(45, new Date("2026-09-09"));
      await advanceCheque(chequeId!, { status: "DEPOSITED", note: "Ziraat'e verildi" }, adminId);
      const cheque = await getCheque(chequeId!);
      expect(cheque?.events.map((e) => e.toStatus)).toEqual(["PORTFOLIO", "DEPOSITED"]);
      expect(cheque?.events[1]?.note).toBe("Ziraat'e verildi");
    });
  });
});
