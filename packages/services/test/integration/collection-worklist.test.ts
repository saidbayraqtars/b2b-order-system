import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  getCollectionWorklist,
  recordCollectionCall,
} from "../../src/collection-worklist";

// Tahsilat çalışma listesi.
//
// Sınanan asıl şey **sıra**: liste borç büyüklüğüne göre değil duruma göre
// diziliyor, ve söz verilen gün gelene kadar müşteri listenin altında bekliyor.
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `cw${Date.now()}`;

let repId: string;
let adminId: string;
/** Büyük borçlu, hiç aranmamış. */
let bigId: string;
/** Küçük borçlu, sözü geçmiş. */
let brokenId: string;
/** Orta borçlu, sözü geleceğe verilmiş. */
let pendingId: string;

/** Vadesi geçmiş borç: verilen gün kadar önce yazılan bir DEBIT. */
async function overdueDebt(companyId: string, amount: number, daysAgo: number) {
  const at = new Date(Date.now() - daysAgo * 86_400_000);
  await prisma.transaction.create({
    data: {
      companyId,
      type: "DEBIT",
      amount,
      description: `${TAG} borç`,
      createdAt: at,
      dueDate: at,
      recordedById: adminId,
    },
  });
}

suite("tahsilat çalışma listesi", () => {
  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `cw-admin-${TAG}@test.local`,
        name: "Tahsilat Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;

    const rep = await prisma.user.create({
      data: {
        email: `cw-rep-${TAG}@test.local`,
        name: "Tahsilat Plasiyeri",
        passwordHash: "x",
        role: "SALES_REP",
      },
    });
    repId = rep.id;

    const make = async (name: string) =>
      (
        await prisma.company.create({
          data: { name: `${name} ${TAG}`, creditLimit: 1_000_000, salesRepId: repId },
        })
      ).id;

    bigId = await make("Büyük");
    brokenId = await make("Sözü geçen");
    pendingId = await make("Söz bekleyen");

    await overdueDebt(bigId, 100_000, 40);
    await overdueDebt(brokenId, 5_000, 20);
    await overdueDebt(pendingId, 50_000, 10);
  });

  afterAll(async () => {
    const companies = [bigId, brokenId, pendingId];
    await prisma.collectionCall.deleteMany({
      where: { companyId: { in: companies } },
    });
    await prisma.transaction.deleteMany({
      where: { companyId: { in: companies } },
    });
    await prisma.company.deleteMany({ where: { id: { in: companies } } });
    await prisma.user.deleteMany({ where: { id: { in: [repId, adminId] } } });
    await prisma.$disconnect();
  });

  const mine = async () => {
    const list = await getCollectionWorklist({ salesRepId: repId });
    return list;
  };

  const rowFor = (list: Awaited<ReturnType<typeof mine>>, id: string) =>
    list.rows.find((r) => r.companyId === id);

  it("vadesi geçmiş cariler listeye giriyor, hiç aranmamış olarak", async () => {
    const list = await mine();
    expect(list.rows).toHaveLength(3);
    expect(rowFor(list, bigId)).toMatchObject({
      state: "NEVER_CALLED",
      overdue: "100000.00",
      daysOverdue: 40,
    });
  });

  it("başlangıçta sıra borç büyüklüğüne göre", async () => {
    const list = await mine();
    expect(list.rows[0]!.companyId).toBe(bigId);
  });

  it("söz verilen gün gelmeden cari listenin altına iniyor", async () => {
    const future = new Date(Date.now() + 7 * 86_400_000);
    await recordCollectionCall(
      {
        companyId: pendingId,
        outcome: "PROMISED",
        promisedDate: `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`,
        promisedAmount: 50_000,
        note: "Cuma ödeyecek",
      },
      repId,
    );

    const list = await mine();
    expect(rowFor(list, pendingId)?.state).toBe("PROMISE_PENDING");
    // En altta ve "aranacak" sayısına girmiyor.
    expect(list.rows.at(-1)!.companyId).toBe(pendingId);
    expect(list.actionable).toBe(2);
  });

  it("sözü geçen cari, borcu küçük olsa da listenin başına çıkıyor", async () => {
    const past = new Date(Date.now() - 3 * 86_400_000);
    await recordCollectionCall(
      {
        companyId: brokenId,
        outcome: "PROMISED",
        promisedDate: `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, "0")}-${String(past.getDate()).padStart(2, "0")}`,
        promisedAmount: 5_000,
      },
      repId,
    );

    const list = await mine();
    // 5.000 ₺'lik sözü geçen cari, 100.000 ₺'lik hiç aranmamışın önünde.
    expect(list.rows[0]!.companyId).toBe(brokenId);
    expect(rowFor(list, brokenId)?.state).toBe("PROMISE_DUE");
    expect(list.brokenPromiseTotal).toBe("5000.00");
  });

  it("tarihsiz söz kaydedilemiyor", async () => {
    await expect(
      recordCollectionCall(
        { companyId: bigId, outcome: "PROMISED" },
        repId,
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("son arama kazanıyor — kayıt düzeltilmiyor, üstüne yazılıyor", async () => {
    await recordCollectionCall(
      { companyId: bigId, outcome: "UNREACHABLE", note: "Telefon kapalı" },
      repId,
    );
    let list = await mine();
    expect(rowFor(list, bigId)?.state).toBe("UNREACHABLE");

    await recordCollectionCall(
      { companyId: bigId, outcome: "NO_PROMISE", note: "Muhasebeci izinde" },
      repId,
    );
    list = await mine();
    expect(rowFor(list, bigId)).toMatchObject({
      state: "NO_PROMISE",
      lastCall: expect.objectContaining({ note: "Muhasebeci izinde" }),
    });
  });

  it("vadesi geçmemiş cari listeye girmiyor", async () => {
    const fresh = await prisma.company.create({
      data: { name: `Taze ${TAG}`, creditLimit: 1_000_000, salesRepId: repId },
    });
    // Vadesi bir hafta sonra: hatırlatılacak bir şey yok.
    await prisma.transaction.create({
      data: {
        companyId: fresh.id,
        type: "DEBIT",
        amount: 9_000,
        description: `${TAG} vadesi gelmemiş`,
        dueDate: new Date(Date.now() + 7 * 86_400_000),
        recordedById: adminId,
      },
    });

    const list = await mine();
    expect(list.rows.some((r) => r.companyId === fresh.id)).toBe(false);

    await prisma.transaction.deleteMany({ where: { companyId: fresh.id } });
    await prisma.company.delete({ where: { id: fresh.id } });
  });
});
