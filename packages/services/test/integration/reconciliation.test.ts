import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  cancelReconciliation,
  getReconciliationSummary,
  listReconciliations,
  respondToReconciliation,
  sendReconciliations,
} from "../../src/reconciliation";

// Cari mutabakat.
//
// Sınanan asıl şey **bakiyenin doğru donması**: mektup dönem sonuna ait ve
// defter işlemeye devam ediyor. Sonradan yazılan bir hareket mektuptaki sayıyı
// değiştirmemeli.
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `rec${Date.now()}`;

let companyId: string;
let quietCompanyId: string;
let adminId: string;
let buyerId: string;

/** Dönem: geçen ayın tamamı. */
const PERIOD = { from: "2026-07-01", to: "2026-07-31" };

async function tx(
  company: string,
  type: "DEBIT" | "CREDIT",
  amount: number,
  at: string,
) {
  await prisma.transaction.create({
    data: {
      companyId: company,
      type,
      amount,
      description: `${TAG} ${type}`,
      createdAt: new Date(at),
      recordedById: adminId,
    },
  });
}

suite("cari mutabakat", () => {
  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `rec-admin-${TAG}@test.local`,
        name: "Mutabakat Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;

    const company = await prisma.company.create({
      data: { name: `Mutabık ${TAG}`, creditLimit: 1_000_000 },
    });
    companyId = company.id;

    const quiet = await prisma.company.create({
      data: { name: `Sessiz ${TAG}`, creditLimit: 1_000_000 },
    });
    quietCompanyId = quiet.id;

    const buyer = await prisma.user.create({
      data: {
        email: `rec-buyer-${TAG}@test.local`,
        name: "Bayi Yöneticisi",
        passwordHash: "x",
        role: "COMPANY_ADMIN",
        companyId,
      },
    });
    buyerId = buyer.id;

    // Dönem öncesi: 1.000 borç → açılış bakiyesi 1.000.
    await tx(companyId, "DEBIT", 1000, "2026-06-15T10:00:00.000Z");
    // Dönem içi: 5.000 borç, 2.000 tahsilat → kapanış 4.000.
    await tx(companyId, "DEBIT", 5000, "2026-07-10T10:00:00.000Z");
    await tx(companyId, "CREDIT", 2000, "2026-07-20T10:00:00.000Z");
    // Dönem SONRASI: mektuptaki sayıya girmemeli.
    await tx(companyId, "DEBIT", 9999, "2026-08-05T10:00:00.000Z");
  });

  afterAll(async () => {
    const companies = [companyId, quietCompanyId];
    await prisma.reconciliation.deleteMany({
      where: { companyId: { in: companies } },
    });
    await prisma.transaction.deleteMany({
      where: { companyId: { in: companies } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, buyerId] } } });
    await prisma.company.deleteMany({ where: { id: { in: companies } } });
    await prisma.$disconnect();
  });

  const mine = async () =>
    (await listReconciliations({ companyId })).at(0) ?? null;

  it("bakiyeyi dönem sonunda donduruyor — sonraki hareket girmiyor", async () => {
    const result = await sendReconciliations(
      { ...PERIOD, companyIds: [companyId] },
      adminId,
    );
    expect(result.created).toBe(1);

    const row = await mine();
    // 1.000 açılış + 5.000 borç − 2.000 tahsilat = 4.000.
    // Ağustos'taki 9.999 mektupta yok.
    expect(row).toMatchObject({
      balance: "4000.00",
      totalDebit: "5000.00",
      totalCredit: "2000.00",
      status: "SENT",
    });
  });

  it("hareketsiz ve sıfır bakiyeli firmaya göndermiyor", async () => {
    const result = await sendReconciliations(
      { ...PERIOD, companyIds: [quietCompanyId] },
      adminId,
    );
    expect(result).toMatchObject({ created: 0, skippedZero: 1 });
  });

  it("istenirse sıfır bakiyeliye de gönderiyor", async () => {
    const result = await sendReconciliations(
      { ...PERIOD, companyIds: [quietCompanyId], includeZeroBalance: true },
      adminId,
    );
    expect(result.created).toBe(1);
  });

  it("aynı döneme ikinci mektup göndermiyor", async () => {
    const result = await sendReconciliations(
      { ...PERIOD, companyIds: [companyId] },
      adminId,
    );
    expect(result).toMatchObject({ created: 0, skippedOpen: 1 });
  });

  it("gerekçesiz itirazı reddediyor", async () => {
    const row = await mine();
    await expect(
      respondToReconciliation({ id: row!.id, agreed: false }, buyerId),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("itirazı gerekçesiyle kaydediyor ve defteri oynatmıyor", async () => {
    const before = await prisma.transaction.count({ where: { companyId } });
    const row = await mine();

    const updated = await respondToReconciliation(
      { id: row!.id, agreed: false, note: "20 Temmuz tahsilatı 2.500 ₺ idi" },
      buyerId,
    );
    expect(updated).toMatchObject({
      status: "DISPUTED",
      responseNote: "20 Temmuz tahsilatı 2.500 ₺ idi",
      respondedByName: "Bayi Yöneticisi",
    });

    // Cevap bir beyandır: defterde tek bir satır bile açılmamalı.
    expect(await prisma.transaction.count({ where: { companyId } })).toBe(before);
  });

  it("cevaplanmış mektup ikinci kez cevaplanamıyor", async () => {
    const row = await mine();
    await expect(
      respondToReconciliation({ id: row!.id, agreed: true }, buyerId),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("cevaplanmış mektup geri çekilemiyor", async () => {
    const row = await mine();
    await expect(
      cancelReconciliation(row!.id, adminId),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("cevaplanmamış mektup geri çekilebiliyor ve yerine yenisi gönderilebiliyor", async () => {
    const quiet = (await listReconciliations({ companyId: quietCompanyId })).at(0);
    await cancelReconciliation(quiet!.id, adminId);

    const again = await sendReconciliations(
      { ...PERIOD, companyIds: [quietCompanyId], includeZeroBalance: true },
      adminId,
    );
    expect(again.created).toBe(1);
  });

  it("özet itiraz edilen tutarı topluyor", async () => {
    const summary = await getReconciliationSummary();
    expect(summary.disputed).toBeGreaterThanOrEqual(1);
    expect(Number(summary.disputedAmount)).toBeGreaterThanOrEqual(4000);
  });

  it("dönem sonu dönem başından önce olamaz", async () => {
    await expect(
      sendReconciliations(
        { from: "2026-07-31", to: "2026-07-01", companyIds: [companyId] },
        adminId,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PERIOD" });
  });
});
