import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { GET as getCheques } from "@/app/api/cheques/route";
import {
  GET as getCheque,
  PATCH as patchCheque,
  POST as actOnCheque,
} from "@/app/api/cheques/[id]/route";
import { POST as postPayment } from "@/app/api/payments/route";
import { POST as reversePayment } from "@/app/api/payments/[id]/reverse/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Çek/senet portföyü, para tutan kodun tek testsiz köşesiydi: 624 satırlık bir
// servis, kasaya ve cariye yazan bir durum makinesi, ve altında hiçbir test.
// Buradaki iddiaların hepsi defterle ilgili — "ekranda ne görünüyor" değil,
// "hangi adımda para nereye yazıldı".
//
// Uçtan çağrılıyor çünkü kâğıdın kendisi elle açılamıyor: portföye giren her
// satır bir tahsilattan doğuyor ve o yolun kendisi kuralın parçası.

const fx = new Fixtures("cheque");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
let rep: TestUser;
let companyId: string;
let cashAccountId: string;
/** Varsayılan kasayı bu test mi açtı — açtıysa sonunda kendisi kaldırıyor. */
let openedAccount = false;

/** Firmanın anlık bakiyesi (kuruşla, sayı olarak). */
async function balance(): Promise<number> {
  const row = await prisma.company.findUnique({
    where: { id: companyId },
    select: { currentBalance: true },
  });
  return Number(row!.currentBalance);
}

/** Cariye borç yaz — tahsilat edilecek bir alacak olsun diye. */
async function debit(amount: number): Promise<void> {
  await prisma.transaction.create({
    data: {
      company: { connect: { id: companyId } },
      type: "DEBIT",
      amount,
      description: "test borcu",
      recordedBy: { connect: { id: admin.id } },
    },
  });
  await prisma.company.update({
    where: { id: companyId },
    data: { currentBalance: { increment: amount } },
  });
}

/**
 * Çekle tahsilat yap ve portföye düşen kâğıdı döndür.
 *
 * `kind` senet için `PROMISSORY_NOTE`; tahsilat yöntemi kâğıdın türünü de
 * belirliyor, ayrı bir alan yok.
 */
async function collectByCheque(
  amount: number,
  options: {
    kind?: "CHEQUE" | "PROMISSORY_NOTE";
    dueDate?: Date;
    serialNumber?: string;
  } = {},
): Promise<{ chequeId: string; transactionId: string }> {
  await debit(amount);
  const res = await callRoute<{ chequeId: string; transactionId: string }>(
    postPayment,
    {
      url: "/api/payments",
      method: "POST",
      body: {
        companyId,
        amount,
        collectionMethod: options.kind ?? "CHEQUE",
        cheque: {
          ...(options.dueDate ? { dueDate: options.dueDate.toISOString() } : {}),
          ...(options.serialNumber ? { serialNumber: options.serialNumber } : {}),
        },
      },
      token: await bearer(rep),
    },
  );
  expect(res.status).toBe(201);
  expect(res.body.chequeId).toBeTruthy();
  return { chequeId: res.body.chequeId, transactionId: res.body.transactionId };
}

/** Kâğıdı bir sonraki duruma geçir (uçtan, yönetici olarak). */
async function advance(
  chequeId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  return callRoute(actOnCheque, {
    url: `/api/cheques/${chequeId}`,
    method: "POST",
    params: { id: chequeId },
    body,
    token: await bearer(admin),
  });
}

suite("çek/senet portföyü (HTTP)", () => {
  beforeAll(async () => {
    admin = await fx.user("SUPER_ADMIN");
    rep = await fx.user("SALES_REP");
    const groupId = await fx.group();
    companyId = await fx.company({
      customerGroupId: groupId,
      salesRepId: rep.id,
      currentBalance: 0,
    });

    // Tahsil adımı parayı bir hesaba yazıyor. Kurulumda açılmış bir varsayılan
    // kasa varsa o kullanılıyor; yoksa test kendi kasasını açıp sonunda
    // kaldırıyor — `cash.ts` "tam bir tane varsayılan" kuralını koruyor ve
    // ikinci bir varsayılan açmak o kuralı bozardı.
    const existing = await prisma.cashAccount.findFirst({
      where: { isDefault: true, isActive: true },
      select: { id: true },
    });
    if (existing) {
      cashAccountId = existing.id;
    } else {
      const created = await prisma.cashAccount.create({
        data: { name: `Kasa ${fx.tag}`, kind: "CASH", isDefault: true },
        select: { id: true },
      });
      cashAccountId = created.id;
      openedAccount = true;
    }
  });

  afterAll(async () => {
    await fx.teardown();
    if (openedAccount) {
      await prisma.cashMovement.deleteMany({ where: { accountId: cashAccountId } });
      await prisma.cashAccount.delete({ where: { id: cashAccountId } });
    }
  });

  describe("kâğıdın doğuşu", () => {
    it("çek tahsilatı cariyi kapatır ama kasaya girmez", async () => {
      const before = await balance();
      await debit(1_000);

      const res = await callRoute<{
        chequeId: string | null;
        cashMovementId: string | null;
      }>(postPayment, {
        url: "/api/payments",
        method: "POST",
        body: { companyId, amount: 1_000, collectionMethod: "CHEQUE" },
        token: await bearer(rep),
      });

      expect(res.status).toBe(201);
      // Cari kapandı: müşteri artık borçlu değil.
      expect(await balance()).toBe(before);
      // Kasaya hiçbir şey girmedi: kâğıt henüz para değil.
      expect(res.body.cashMovementId).toBeNull();
      expect(res.body.chequeId).toBeTruthy();

      const cheque = await prisma.cheque.findUnique({
        where: { id: res.body.chequeId! },
        select: { status: true, kind: true, amount: true },
      });
      expect(cheque?.status).toBe("PORTFOLIO");
      expect(cheque?.kind).toBe("CHEQUE");
      expect(Number(cheque?.amount)).toBe(1_000);
    });

    it("senet tahsilatı senet olarak düşer", async () => {
      const { chequeId } = await collectByCheque(500, {
        kind: "PROMISSORY_NOTE",
      });
      const cheque = await prisma.cheque.findUnique({
        where: { id: chequeId },
        select: { kind: true },
      });
      expect(cheque?.kind).toBe("PROMISSORY_NOTE");
    });

    it("portföye girişin kendisi geçmişe yazılıyor", async () => {
      const { chequeId } = await collectByCheque(300);
      const res = await callRoute<
        { cheque: { events: Array<{ toStatus: string }> } },
        { id: string }
      >(getCheque, {
        url: `/api/cheques/${chequeId}`,
        params: { id: chequeId },
        token: await bearer(admin),
      });
      expect(res.status).toBe(200);
      expect(res.body.cheque.events.map((e) => e.toStatus)).toEqual(["PORTFOLIO"]);
    });
  });

  describe("tahsil edilince para girer", () => {
    it("CLEARED kasaya giriş yazar ve hesabı kâğıda işler", async () => {
      const { chequeId } = await collectByCheque(2_000);
      const balanceBefore = await balance();

      const res = await advance(chequeId, { status: "CLEARED" });
      expect(res.status).toBe(200);
      expect(res.body.cashMovementId).toBeTruthy();

      const movement = await prisma.cashMovement.findUnique({
        where: { id: res.body.cashMovementId },
        select: { direction: true, amount: true, source: true, accountId: true },
      });
      expect(movement?.direction).toBe("IN");
      expect(movement?.source).toBe("CHEQUE");
      expect(Number(movement?.amount)).toBe(2_000);

      // Cari ikinci kez kapanmıyor: borcu kapatan tahsilattı, bu adım yalnızca
      // parayı kasaya taşıyor.
      expect(await balance()).toBe(balanceBefore);

      // Kâğıt, parasının hangi hesaba girdiğini taşımalı. Hesap seçilmeden
      // gelen istekte varsayılan kasa bulunuyor; o değer kâğıda yazılmazsa
      // portföy ekranında tahsil edilmiş çekin hesabı boş görünür.
      const cheque = await prisma.cheque.findUnique({
        where: { id: chequeId },
        select: { status: true, cashAccountId: true, cashMovementId: true, settledAt: true },
      });
      expect(cheque?.status).toBe("CLEARED");
      expect(cheque?.cashMovementId).toBe(res.body.cashMovementId);
      expect(cheque?.cashAccountId).toBe(movement?.accountId);
      expect(cheque?.settledAt).not.toBeNull();
    });

    it("tahsil edilen kâğıt bir daha hareket etmiyor", async () => {
      const { chequeId } = await collectByCheque(150);
      expect((await advance(chequeId, { status: "CLEARED" })).status).toBe(200);

      // CLEARED uçtur: geri alma, ters kayıtla değil, kâğıdın kendisiyle
      // yapılamaz. Buradan çıkış yolu tahsilat iptali de değil (aşağıda).
      const again = await advance(chequeId, { status: "PORTFOLIO" });
      expect(again.status).toBe(422);
      expect(again.body.code).toBe("INVALID_CHEQUE_TRANSITION");
    });
  });

  describe("karşılıksız ve iade borcu geri açar", () => {
    it("BOUNCED cariye yeni borç yazar, tahsilatı silmez", async () => {
      const { chequeId, transactionId } = await collectByCheque(800);
      const balanceBefore = await balance();

      const res = await advance(chequeId, { status: "BOUNCED", note: "banka döndü" });
      expect(res.status).toBe(200);
      expect(res.body.reopenTransactionId).toBeTruthy();

      // Borç geri açıldı.
      expect(await balance()).toBe(balanceBefore + 800);

      // Tahsilat kaydı yerinde duruyor: o tahsilat gerçekten yapılmıştı ve
      // ekstrede iki satır olarak okunmalı.
      const original = await prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { type: true },
      });
      expect(original?.type).toBe("CREDIT");

      const reopen = await prisma.transaction.findUnique({
        where: { id: res.body.reopenTransactionId },
        select: { type: true, amount: true },
      });
      expect(reopen?.type).toBe("DEBIT");
      expect(Number(reopen?.amount)).toBe(800);
    });

    it("RETURNED de borcu geri açar ama kasaya dokunmaz", async () => {
      const { chequeId } = await collectByCheque(250);
      const balanceBefore = await balance();

      const res = await advance(chequeId, { status: "RETURNED" });
      expect(res.status).toBe(200);
      expect(res.body.cashMovementId).toBeNull();
      expect(await balance()).toBe(balanceBefore + 250);
    });

    it("ciro edilen kâğıt ne kasaya ne cariye yazar", async () => {
      const { chequeId } = await collectByCheque(600);
      const balanceBefore = await balance();

      const res = await advance(chequeId, {
        status: "ENDORSED",
        endorsedTo: "Tedarikçi A.Ş.",
      });
      expect(res.status).toBe(200);
      expect(res.body.cashMovementId).toBeNull();
      expect(res.body.reopenTransactionId).toBeNull();
      // Kâğıt bize ödeme yapmadı; başkasına ödeme oldu. Cari zaten kapalıydı.
      expect(await balance()).toBe(balanceBefore);

      const cheque = await prisma.cheque.findUnique({
        where: { id: chequeId },
        select: { endorsedTo: true },
      });
      expect(cheque?.endorsedTo).toBe("Tedarikçi A.Ş.");
    });
  });

  describe("tahsilat iptali ile kâğıt arasındaki kilit", () => {
    it("portföydeki kâğıdın tahsilatı iptal edilebilir, kâğıt düşer", async () => {
      const { chequeId, transactionId } = await collectByCheque(400);
      const balanceBefore = await balance();

      const res = await callRoute(reversePayment, {
        url: `/api/payments/${transactionId}/reverse`,
        method: "POST",
        params: { id: transactionId },
        body: { companyId, reason: "yanlış tutar" },
        token: await bearer(admin),
      });
      expect(res.status).toBe(201);
      expect(await balance()).toBe(balanceBefore + 400);

      // Silinmiyor, düşürülüyor: portföyden çıkan kâğıdın izi kalmalı.
      const cheque = await prisma.cheque.findUnique({
        where: { id: chequeId },
        select: { status: true },
      });
      expect(cheque?.status).toBe("CANCELLED");
    });

    it("tahsil edilmiş kâğıdın tahsilatı iptal edilemiyor", async () => {
      const { chequeId, transactionId } = await collectByCheque(900);
      expect((await advance(chequeId, { status: "CLEARED" })).status).toBe(200);

      // Kasaya girmiş parayı defterde yok saymak demek olurdu; önce kâğıt
      // tarafı düzeltilmeli.
      const res = await callRoute(reversePayment, {
        url: `/api/payments/${transactionId}/reverse`,
        method: "POST",
        params: { id: transactionId },
        body: { companyId, reason: "vazgeçtik" },
        token: await bearer(admin),
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("CHEQUE_ALREADY_SETTLED");
    });
  });

  describe("künye", () => {
    it("ofis eksik künyeyi tamamlar, tutar burada değişmiyor", async () => {
      const { chequeId } = await collectByCheque(700);

      const due = new Date(Date.now() + 15 * 24 * 3_600_000);
      const res = await callRoute(patchCheque, {
        url: `/api/cheques/${chequeId}`,
        method: "PATCH",
        params: { id: chequeId },
        body: {
          serialNumber: "0012345",
          bankName: "Ziraat",
          drawerName: "Mehmet Yılmaz",
          dueDate: due.toISOString(),
        },
        token: await bearer(admin),
      });
      expect(res.status).toBe(200);

      const cheque = await prisma.cheque.findUnique({
        where: { id: chequeId },
        select: { serialNumber: true, bankName: true, dueDate: true, amount: true },
      });
      expect(cheque?.serialNumber).toBe("0012345");
      expect(cheque?.bankName).toBe("Ziraat");
      expect(cheque?.dueDate?.toDateString()).toBe(due.toDateString());
      // Tutar künye düzeltmesiyle değişmiyor: tutarı değiştirmek cariyi de
      // değiştirmek demek ve o iş tahsilat iptali + yeniden giriş ile yapılır.
      expect(Number(cheque?.amount)).toBe(700);
    });

    it("kapanmış kâğıdın künyesi değişmiyor", async () => {
      const { chequeId } = await collectByCheque(120);
      expect((await advance(chequeId, { status: "CLEARED" })).status).toBe(200);

      const res = await callRoute(patchCheque, {
        url: `/api/cheques/${chequeId}`,
        method: "PATCH",
        params: { id: chequeId },
        body: { bankName: "Başka Banka" },
        token: await bearer(admin),
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_STATE");
    });
  });

  describe("liste ve özet", () => {
    it("firmaya göre süzülen liste yalnızca o firmanın kâğıtlarını verir", async () => {
      await collectByCheque(1_100, { serialNumber: "SUZ-1" });

      const res = await callRoute<{
        cheques: Array<{ companyId: string; serialNumber: string | null }>;
      }>(getCheques, {
        url: `/api/cheques?companyId=${companyId}`,
        token: await bearer(admin),
      });

      expect(res.status).toBe(200);
      expect(res.body.cheques.length).toBeGreaterThan(0);
      expect(res.body.cheques.every((c) => c.companyId === companyId)).toBe(true);
      expect(res.body.cheques.some((c) => c.serialNumber === "SUZ-1")).toBe(true);
    });

    it("vadesi geçmiş kâğıt işaretleniyor, vadesiz olan eksik sayılıyor", async () => {
      const past = new Date(Date.now() - 5 * 24 * 3_600_000);
      const { chequeId: overdueId } = await collectByCheque(310, { dueDate: past });
      const { chequeId: undatedId } = await collectByCheque(320);

      const res = await callRoute<{
        cheques: Array<{ id: string; isOverdue: boolean; isIncomplete: boolean }>;
      }>(getCheques, {
        url: `/api/cheques?companyId=${companyId}`,
        token: await bearer(admin),
      });

      const overdue = res.body.cheques.find((c) => c.id === overdueId);
      const undated = res.body.cheques.find((c) => c.id === undatedId);
      expect(overdue?.isOverdue).toBe(true);
      expect(undated?.isIncomplete).toBe(true);
      // Vadesi geçmiş olan "eksik" değil: iki ayrı sorun, iki ayrı işaret.
      expect(overdue?.isIncomplete).toBe(false);
    });

    it("özet, elde kalan kâğıdı sayar; tahsil edilen düşer", async () => {
      const summaryOf = async () => {
        const res = await callRoute<{
          summary: { openTotal: string; openCount: number };
        }>(getCheques, { url: "/api/cheques", token: await bearer(admin) });
        return res.body.summary;
      };

      const before = await summaryOf();
      const { chequeId } = await collectByCheque(1_000);

      const afterCollect = await summaryOf();
      expect(afterCollect.openCount).toBe(before.openCount + 1);
      expect(Number(afterCollect.openTotal)).toBeCloseTo(
        Number(before.openTotal) + 1_000,
        2,
      );

      // Tahsil edilen kâğıt artık elimizde değil: özet "sırada ne var"
      // sorusunu yanıtlıyor, geçmişi değil.
      expect((await advance(chequeId, { status: "CLEARED" })).status).toBe(200);
      const afterClear = await summaryOf();
      expect(afterClear.openCount).toBe(before.openCount);
      expect(Number(afterClear.openTotal)).toBeCloseTo(Number(before.openTotal), 2);
    });
  });

  describe("geçiş kuralları", () => {
    it("tahsile verilen kâğıt portföye geri alınabiliyor", async () => {
      const { chequeId } = await collectByCheque(220);
      expect((await advance(chequeId, { status: "DEPOSITED" })).status).toBe(200);

      // Bankaya götürülüp geri getirilen kâğıt gerçek bir durum; tek yönlü bir
      // makine bunu ancak yanlış bir durumla kaydedebilirdi.
      const back = await advance(chequeId, { status: "PORTFOLIO" });
      expect(back.status).toBe(200);
      expect(back.body.status).toBe("PORTFOLIO");

      const cheque = await prisma.cheque.findUnique({
        where: { id: chequeId },
        select: { settledAt: true },
      });
      // Portföye dönen kâğıt kapanmış sayılmaz.
      expect(cheque?.settledAt).toBeNull();
    });

    it("tahsile verilen kâğıt doğrudan ciro edilemiyor", async () => {
      const { chequeId } = await collectByCheque(230);
      expect((await advance(chequeId, { status: "DEPOSITED" })).status).toBe(200);

      // Kâğıt bankada; ciro etmek için önce geri alınması gerekiyor.
      const res = await advance(chequeId, {
        status: "ENDORSED",
        endorsedTo: "Tedarikçi",
      });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("INVALID_CHEQUE_TRANSITION");
    });

    it("her geçiş, kimin yaptığıyla birlikte geçmişe yazılıyor", async () => {
      const { chequeId } = await collectByCheque(240);
      await advance(chequeId, { status: "DEPOSITED", note: "bankaya verildi" });
      await advance(chequeId, { status: "CLEARED" });

      const res = await callRoute<
        {
          cheque: {
            events: Array<{
              fromStatus: string | null;
              toStatus: string;
              note: string | null;
              actorName: string | null;
            }>;
          };
        },
        { id: string }
      >(getCheque, {
        url: `/api/cheques/${chequeId}`,
        params: { id: chequeId },
        token: await bearer(admin),
      });

      const events = res.body.cheque.events;
      expect(events.map((e) => e.toStatus)).toEqual([
        "PORTFOLIO",
        "DEPOSITED",
        "CLEARED",
      ]);
      // Durum kolonu son hâli söyler; ihtilafta gereken şey yol.
      expect(events[1]!.fromStatus).toBe("PORTFOLIO");
      expect(events[1]!.note).toBe("bankaya verildi");
      expect(events[2]!.actorName).toBe(admin.name);
    });
  });
});
