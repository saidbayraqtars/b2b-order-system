import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { GET as getCatalog } from "@/app/api/catalog/route";
import { GET as getCart, PUT as putCart } from "@/app/api/cart/route";
import { GET as getCompanies } from "@/app/api/companies/route";
import { GET as getStatement } from "@/app/api/companies/[id]/statement/route";
import { GET as getOrders } from "@/app/api/orders/route";
import { GET as getPayments, POST as postPayment } from "@/app/api/payments/route";
import { POST as postCheckin } from "@/app/api/checkins/route";
import { GET as getAudit } from "@/app/api/admin/audit/route";
import { GET as getCheques } from "@/app/api/cheques/route";
import { GET as getAdminUsers } from "@/app/api/admin/users/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Who may act on which customer. The guard answers "may this account call this
// endpoint at all"; this file answers the question after it — a rep with a
// perfectly valid token asking about a company that is not theirs.
//
// The rule lives in resolveCompanyId and is applied by hand in every route, so
// a new endpoint that forgets it is exactly the kind of hole nothing else
// catches.

const fx = new Fixtures("scope");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
let rep: TestUser;
let otherRep: TestUser;
let manager: TestUser;
let staff: TestUser;
let courier: TestUser;

let groupId: string;
/** In `rep`'s portfolio, and the company `manager`/`staff` belong to. */
let mine: string;
/** In `otherRep`'s portfolio. Nobody in this file's cast may touch it. */
let theirs: string;

suite("kapsam: hangi hesap hangi firmaya dokunur", () => {
  beforeAll(async () => {
    admin = await fx.user("SUPER_ADMIN");
    rep = await fx.user("SALES_REP", { label: "plasiyer" });
    otherRep = await fx.user("SALES_REP", { label: "digerplasiyer" });
    courier = await fx.user("COURIER");

    groupId = await fx.group();
    mine = await fx.company({ customerGroupId: groupId, salesRepId: rep.id });
    theirs = await fx.company({
      customerGroupId: groupId,
      salesRepId: otherRep.id,
      label: "Yabanci",
    });

    manager = await fx.user("COMPANY_ADMIN", { companyId: mine });
    staff = await fx.user("COMPANY_STAFF", { companyId: mine });
  });

  afterAll(() => fx.teardown());

  describe("plasiyer portföyü", () => {
    it("portföyündeki firmanın katalogunu açar", async () => {
      const res = await callRoute(getCatalog, {
        url: `/api/catalog?companyId=${mine}`,
        token: await bearer(rep),
      });
      expect(res.status).toBe(200);
    });

    it("portföyünde olmayan firmanın katalogu 403", async () => {
      const res = await callRoute(getCatalog, {
        url: `/api/catalog?companyId=${theirs}`,
        token: await bearer(rep),
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/portföyünüzde değil/i);
    });

    it("firma seçmeden sepet istemek 400", async () => {
      // Plasiyerin \"kendi\" firması yok; hangi müşteri adına konuştuğunu
      // söylemek zorunda.
      const res = await callRoute(getCart, {
        url: "/api/cart",
        token: await bearer(rep),
      });
      expect(res.status).toBe(400);
    });

    it("var olmayan firma kimliği 403 (\"yok\" demek de bilgi verir)", async () => {
      const res = await callRoute(getCatalog, {
        url: "/api/catalog?companyId=cly000000000000000000000",
        token: await bearer(rep),
      });
      expect(res.status).toBe(403);
    });

    it("sipariş listesi firma verilmezse portföyle sınırlıdır", async () => {
      await prisma.order.createMany({
        data: [
          orderRow(mine, rep.id, "SC-MINE"),
          orderRow(theirs, otherRep.id, "SC-THEIRS"),
        ],
      });

      const res = await callRoute(getOrders, {
        url: "/api/orders",
        token: await bearer(rep),
      });
      expect(res.status).toBe(200);
      const companies = res.body.orders.map((o: { company: { id: string } }) => o.company.id);
      expect(companies).toContain(mine);
      expect(companies).not.toContain(theirs);
    });

    it("ekstre başka portföyün firmasına kapalı", async () => {
      const res = await callRoute(getStatement, {
        url: `/api/companies/${theirs}/statement`,
        token: await bearer(rep),
        params: { id: theirs },
      });
      expect(res.status).toBe(403);
    });

    it("firma listesi yalnız portföyü döner", async () => {
      const res = await callRoute(getCompanies, {
        url: "/api/companies",
        token: await bearer(rep),
      });
      const ids = res.body.companies.map((c: { id: string }) => c.id);
      expect(ids).toContain(mine);
      expect(ids).not.toContain(theirs);
    });
  });

  describe("bayi kullanıcısı kendi firmasına çivilidir", () => {
    it("kendi firmasını istemek serbest", async () => {
      const res = await callRoute(getCart, {
        url: `/api/cart?companyId=${mine}`,
        token: await bearer(staff),
      });
      expect(res.status).toBe(200);
    });

    it("firma vermezse kendi firmasına düşer", async () => {
      const res = await callRoute(getCart, {
        url: "/api/cart",
        token: await bearer(staff),
      });
      expect(res.status).toBe(200);
      expect(res.body.companyId).toBe(mine);
    });

    it("başka firmayı istemek 403", async () => {
      const res = await callRoute(getCart, {
        url: `/api/cart?companyId=${theirs}`,
        token: await bearer(staff),
      });
      expect(res.status).toBe(403);
    });

    it("gövdedeki firma da doğrulanır, yalnız sorgu değil", async () => {
      // Aynı kural iki ayrı yerden geliyor (sorgu dizesi ve JSON gövde); biri
      // kontrol edilip diğeri unutulsaydı yazma yolu açık kalırdı.
      const res = await callRoute(putCart, {
        url: "/api/cart",
        method: "PUT",
        body: { companyId: theirs, items: [] },
        token: await bearer(staff),
      });
      expect(res.status).toBe(403);
    });

    it("firması silinmiş bayi hesabı hiçbir şey göremez", async () => {
      const orphan = await fx.user("COMPANY_STAFF", {
        companyId: null,
        label: "firmasiz",
      });
      const res = await callRoute(getCart, {
        url: "/api/cart",
        token: await bearer(orphan),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("kurye", () => {
    it("firma üzerinden gelen hiçbir ekranı açamaz", async () => {
      const res = await callRoute(getCatalog, {
        url: `/api/catalog?companyId=${mine}`,
        token: await bearer(courier),
      });
      // Rolün kataloğa izni yok; kapı izinde kapanıyor.
      expect(res.status).toBe(403);
    });

    it("firma listesi kuryeye boş döner, herkesi göstermez", async () => {
      const withView = await fx.user("COURIER", {
        // Kapsam dışı olduğu için normalde verilemez; verilse bile listenin
        // boş dönmesi gerekir — sessizce her firmayı göstermemeli.
        permissions: ["companies.view"],
        label: "kuryegoz",
      });
      const res = await callRoute(getCompanies, {
        url: "/api/companies",
        token: await bearer(withView),
      });
      expect(res.status).toBe(200);
      expect(res.body.companies).toEqual([]);
    });
  });

  describe("saha parası yalnız sahanın", () => {
    it("bayi yöneticisi tahsilat işleyemez", async () => {
      const res = await callRoute(postPayment, {
        url: "/api/payments",
        method: "POST",
        body: { companyId: mine, amount: 100, collectionMethod: "CASH" },
        token: await bearer(manager),
      });
      expect(res.status).toBe(403);
    });

    it("plasiyer başka portföyün firmasına tahsilat işleyemez", async () => {
      const res = await callRoute(postPayment, {
        url: "/api/payments",
        method: "POST",
        body: { companyId: theirs, amount: 100, collectionMethod: "CASH" },
        token: await bearer(rep),
      });
      expect(res.status).toBe(403);
    });

    it("firmasız tahsilat listesi kaydedenin kendi kayıtlarıdır", async () => {
      const res = await callRoute(getPayments, {
        url: "/api/payments",
        token: await bearer(rep),
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.payments)).toBe(true);
    });

    it("ziyaret açmak da portföyle sınırlı", async () => {
      const res = await callRoute(postCheckin, {
        url: "/api/checkins",
        method: "POST",
        body: { companyId: theirs, latitude: 41, longitude: 29 },
        token: await bearer(rep),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("yalnız süper admine açık uçlar", () => {
    const onlyAdmin: Array<[string, Parameters<typeof callRoute>[0], string]> = [
      ["denetim kaydı", getAudit, "/api/admin/audit"],
      ["çek portföyü", getCheques, "/api/cheques"],
    ];

    for (const [name, handler, url] of onlyAdmin) {
      it(`${name}: bayi yöneticisine kapalı`, async () => {
        const res = await callRoute(handler, { url, token: await bearer(manager) });
        expect(res.status).toBe(403);
      });

      it(`${name}: plasiyere kapalı`, async () => {
        const res = await callRoute(handler, { url, token: await bearer(rep) });
        expect(res.status).toBe(403);
      });

      it(`${name}: süper admine açık`, async () => {
        const res = await callRoute(handler, { url, token: await bearer(admin) });
        expect(res.status).toBe(200);
      });
    }
  });

  describe("kullanıcı yönetimi iki role birden açık, aynı kapsamda değil", () => {
    it("bayi yöneticisi yalnız kendi firmasının hesaplarını listeler", async () => {
      const res = await callRoute(getAdminUsers, {
        url: "/api/admin/users",
        token: await bearer(manager),
      });
      expect(res.status).toBe(200);
      const companies = new Set(
        res.body.users.map((u: { company: { id: string } | null }) => u.company?.id),
      );
      expect([...companies]).toEqual([mine]);
    });

    it("başka firmayı sorması listeyi genişletmez", async () => {
      // Filtre bir *daraltma* aracı; kapsamı belirleyen şey çağıranın kendi
      // firması. Süper admin için tersi geçerli, o yüzden aynı uç iki kapsam
      // taşıyor ve karışması en pahalı yer burası.
      const res = await callRoute(getAdminUsers, {
        url: `/api/admin/users?companyId=${theirs}`,
        token: await bearer(manager),
      });
      expect(res.status).toBe(200);
      for (const u of res.body.users as Array<{ company: { id: string } | null }>) {
        expect(u.company?.id).toBe(mine);
      }
    });

    it("bayi personeli kullanıcı yönetimini hiç açamaz", async () => {
      const res = await callRoute(getAdminUsers, {
        url: "/api/admin/users",
        token: await bearer(staff),
      });
      expect(res.status).toBe(403);
    });
  });
});

/** Minimal order row — these tests only ever read which company it belongs to. */
function orderRow(companyId: string, createdById: string, prefix: string) {
  return {
    orderNumber: `${prefix}-${Math.random().toString(36).slice(2, 10)}`,
    companyId,
    createdById,
    status: "PENDING_APPROVAL" as const,
    subtotal: 0,
    discountTotal: 0,
    taxTotal: 0,
    grandTotal: 0,
  };
}
