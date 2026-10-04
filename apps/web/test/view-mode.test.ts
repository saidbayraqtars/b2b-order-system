import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { GET, PUT } from "@/app/api/account/gorunum/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Basit/gelişmiş görünüm tercihi.
//
// Varsayılan basit; tercih kullanıcının satırında, cihazda değil. Uç yalnızca
// kendi hesabını değiştirir — gövdede hedef kullanıcı yok.

const fx = new Fixtures("gorunum");
const suite = hasDb ? describe : describe.skip;

let user: TestUser;
let other: TestUser;

beforeAll(async () => {
  if (!hasDb) return;
  user = await fx.user("SUPER_ADMIN");
  other = await fx.user("SUPER_ADMIN", { label: "obur" });
});

afterAll(async () => {
  await fx.teardown();
});

suite("görünüm tercihi", () => {
  it("kimliksiz 401", async () => {
    const res = await callRoute(GET, { url: "/api/account/gorunum" });
    expect(res.status).toBe(401);
  });

  it("varsayılan basit; açılınca yalnız kendi satırı değişir", async () => {
    const first = await callRoute(GET, {
      url: "/api/account/gorunum",
      token: await bearer(user),
    });
    expect(first.body.advanced).toBe(false);

    const set = await callRoute(PUT, {
      url: "/api/account/gorunum",
      method: "PUT",
      token: await bearer(user),
      // Fazladan alan yok sayılıyor: başkasının tercihini değiştirmenin yolu yok.
      body: { advanced: true, userId: other.id },
    });
    expect(set.status).toBe(200);
    expect(set.body.advanced).toBe(true);

    const rows = await prisma.user.findMany({
      where: { id: { in: [user.id, other.id] } },
      select: { id: true, advancedView: true },
    });
    expect(rows.find((r) => r.id === user.id)?.advancedView).toBe(true);
    expect(rows.find((r) => r.id === other.id)?.advancedView).toBe(false);
  });

  it("geçersiz gövde 400", async () => {
    const res = await callRoute(PUT, {
      url: "/api/account/gorunum",
      method: "PUT",
      token: await bearer(user),
      body: { advanced: "evet" },
    });
    expect(res.status).toBe(400);
  });
});
