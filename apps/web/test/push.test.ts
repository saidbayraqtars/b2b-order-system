import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  DELETE as deleteToken,
  POST as postToken,
} from "@/app/api/mobile/push-token/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Bildirim adresinin sahibi.
//
// Buradaki tek ilginç soru şu: bir jeton kime ait? Yanlış cevap, birinin sipariş
// ve tahsilat bildirimlerinin başkasının telefonuna düşmesi demek — ve bu, ortak
// kullanılan bir telefonda kurgusal değil, olağan hâl.

const fx = new Fixtures("push");
const suite = hasDb ? describe : describe.skip;

const TOKEN_A = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const TOKEN_B = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";

let buyer: TestUser;
let rep: TestUser;

suite("push jetonu (HTTP)", () => {
  beforeAll(async () => {
    const groupId = await fx.group();
    const companyId = await fx.company({ customerGroupId: groupId });
    buyer = await fx.user("COMPANY_ADMIN", { companyId });
    rep = await fx.user("SALES_REP");
  });

  beforeEach(async () => {
    await prisma.pushDevice.deleteMany({
      where: { token: { in: [TOKEN_A, TOKEN_B] } },
    });
  });

  afterAll(async () => {
    await prisma.pushDevice.deleteMany({
      where: { token: { in: [TOKEN_A, TOKEN_B] } },
    });
    await fx.teardown();
  });

  it("kimliksiz istek reddedilir", async () => {
    const res = await callRoute(postToken, {
      url: "/api/mobile/push-token",
      method: "POST",
      body: { token: TOKEN_A, platform: "android" },
    });

    expect(res.status).toBe(401);
    expect(await countOf(TOKEN_A)).toBe(0);
  });

  it("cihaz oturumun sahibine bağlanır", async () => {
    const res = await callRoute(postToken, {
      url: "/api/mobile/push-token",
      method: "POST",
      body: { token: TOKEN_A, platform: "android", deviceName: "Test telefonu" },
      token: await bearer(buyer),
    });

    expect(res.status).toBe(200);
    const row = await prisma.pushDevice.findUnique({ where: { token: TOKEN_A } });
    expect(row?.userId).toBe(buyer.id);
    expect(row?.deviceName).toBe("Test telefonu");
    expect(row?.disabledAt).toBeNull();
  });

  it("gövdedeki kullanıcı kimliği dikkate alınmaz", async () => {
    // İstemcinin verdiği kimliğe güvenilseydi, herkes bildirimlerini
    // istediği hesaba yönlendirebilirdi.
    const res = await callRoute(postToken, {
      url: "/api/mobile/push-token",
      method: "POST",
      body: { token: TOKEN_A, platform: "android", userId: rep.id },
      token: await bearer(buyer),
    });

    expect(res.status).toBe(200);
    const row = await prisma.pushDevice.findUnique({ where: { token: TOKEN_A } });
    expect(row?.userId).toBe(buyer.id);
  });

  it("aynı cihazdan başkası girerse jeton yeni kullanıcıya geçer", async () => {
    await callRoute(postToken, {
      url: "/api/mobile/push-token",
      method: "POST",
      body: { token: TOKEN_A, platform: "android" },
      token: await bearer(buyer),
    });

    await callRoute(postToken, {
      url: "/api/mobile/push-token",
      method: "POST",
      body: { token: TOKEN_A, platform: "android" },
      token: await bearer(rep),
    });

    // Tek satır: aynı telefon iki hesaba birden bildirim almaz.
    expect(await countOf(TOKEN_A)).toBe(1);
    const row = await prisma.pushDevice.findUnique({ where: { token: TOKEN_A } });
    expect(row?.userId).toBe(rep.id);
  });

  it("biçimi tutmayan jeton yazılmaz", async () => {
    const res = await callRoute(postToken, {
      url: "/api/mobile/push-token",
      method: "POST",
      body: { token: "not-a-push-token", platform: "android" },
      token: await bearer(buyer),
    });

    // Uç yine de 200: telefon tarafında yapacak bir şey yok ve hata göstermek
    // kullanıcıya anlamsız gelir. Önemli olan satırın açılmaması.
    expect(res.status).toBe(200);
    expect(await countOf("not-a-push-token")).toBe(0);
  });

  it("çıkışta yalnızca kendi cihazı çözülür", async () => {
    await callRoute(postToken, {
      url: "/api/mobile/push-token",
      method: "POST",
      body: { token: TOKEN_A, platform: "android" },
      token: await bearer(buyer),
    });
    await callRoute(postToken, {
      url: "/api/mobile/push-token",
      method: "POST",
      body: { token: TOKEN_B, platform: "android" },
      token: await bearer(rep),
    });

    // Alıcı, elindeki başka bir jetonu silmeye çalışıyor.
    const res = await callRoute(deleteToken, {
      url: "/api/mobile/push-token",
      method: "DELETE",
      body: { token: TOKEN_B },
      token: await bearer(buyer),
    });

    expect(res.status).toBe(200);
    expect(await countOf(TOKEN_B)).toBe(1);

    await callRoute(deleteToken, {
      url: "/api/mobile/push-token",
      method: "DELETE",
      body: { token: TOKEN_A },
      token: await bearer(buyer),
    });
    expect(await countOf(TOKEN_A)).toBe(0);
  });

  it("düşmüş cihaz yeniden kayıtta geri açılır", async () => {
    await callRoute(postToken, {
      url: "/api/mobile/push-token",
      method: "POST",
      body: { token: TOKEN_A, platform: "android" },
      token: await bearer(buyer),
    });
    await prisma.pushDevice.update({
      where: { token: TOKEN_A },
      data: { disabledAt: new Date() },
    });

    await callRoute(postToken, {
      url: "/api/mobile/push-token",
      method: "POST",
      body: { token: TOKEN_A, platform: "android" },
      token: await bearer(buyer),
    });

    const row = await prisma.pushDevice.findUnique({ where: { token: TOKEN_A } });
    expect(row?.disabledAt).toBeNull();
  });

  it("yetkileri değişmiş oturumun jetonu kabul edilmez", async () => {
    const stale = await bearer(buyer, { tokenVersion: -1 });

    const res = await callRoute(postToken, {
      url: "/api/mobile/push-token",
      method: "POST",
      body: { token: TOKEN_A, platform: "android" },
      token: stale,
    });

    expect(res.status).toBe(401);
    expect(await countOf(TOKEN_A)).toBe(0);
  });
});

function countOf(token: string): Promise<number> {
  return prisma.pushDevice.count({ where: { token } });
}
