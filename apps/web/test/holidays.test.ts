import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  GET as getHolidays,
  POST as postHoliday,
} from "@/app/api/admin/holidays/route";
import { DELETE as deleteHoliday } from "@/app/api/admin/holidays/[id]/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Resmî tatil takvimi (KALAN-ISLER §6.4).
//
// Takvimin tek işi ay sonu projeksiyonunun iş günü sayacını beslemek, ama
// buradaki iddialar uçla ilgili: kimin girebildiği, aynı güne ikinci kaydın ne
// yaptığı, ve önerilen listenin ne **içermediği**.
//
// Sonuncusu bir davranış değil bir söz: dinî bayramların tarihi ay takvimine
// göre kayıyor ve kodda yazılı bir tarih ikinci yıl sessizce yanlış olur.
// Testi var çünkü "kolaylık olsun" diye eklenmesi kolay bir şey.

const fx = new Fixtures("holiday");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
let plain: TestUser;
const year = 2031;

beforeAll(async () => {
  if (!hasDb) return;
  admin = await fx.user("SUPER_ADMIN");
  // Aynı kabuktaki bir yönetici ama `organization.manage` olmadan: kapının
  // role değil izne baktığını gösteren asıl vaka.
  plain = await fx.user("SUPER_ADMIN", { permissions: [], label: "izinsiz" });
});

afterAll(async () => {
  if (!hasDb) return;
  await prisma.holiday.deleteMany({
    where: { date: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31) } },
  });
  await fx.teardown();
});

suite("resmî tatil takvimi", () => {
  it("izinsiz kullanıcı takvimi göremiyor", async () => {
    const res = await callRoute(getHolidays, {
      url: `/api/admin/holidays?yil=${year}`,
      token: await bearer(plain),
    });
    expect(res.status).toBe(403);
  });

  it("gün ekleniyor ve o yılın listesinde çıkıyor", async () => {
    const add = await callRoute(postHoliday, {
      url: "/api/admin/holidays",
      method: "POST",
      token: await bearer(admin),
      body: { date: `${year}-01-01`, name: "Yılbaşı", halfDay: false },
    });
    expect(add.status).toBe(200);
    expect(add.body.holiday.date).toBe(`${year}-01-01`);

    const list = await callRoute(getHolidays, {
      url: `/api/admin/holidays?yil=${year}`,
      token: await bearer(admin),
    });
    expect(list.status).toBe(200);
    expect(list.body.holidays).toHaveLength(1);
    expect(list.body.holidays[0].name).toBe("Yılbaşı");
  });

  it("aynı güne ikinci kayıt üzerine yazıyor, ikinci satır açmıyor", async () => {
    // Operatör 1 Ocak'ı iki kez girdiğinde istediği şey ikinci kayıt.
    const again = await callRoute(postHoliday, {
      url: "/api/admin/holidays",
      method: "POST",
      token: await bearer(admin),
      body: { date: `${year}-01-01`, name: "Yeni yıl", halfDay: true },
    });
    expect(again.status).toBe(200);

    const list = await callRoute(getHolidays, {
      url: `/api/admin/holidays?yil=${year}`,
      token: await bearer(admin),
    });
    expect(list.body.holidays).toHaveLength(1);
    expect(list.body.holidays[0].name).toBe("Yeni yıl");
    expect(list.body.holidays[0].halfDay).toBe(true);
  });

  it("gün, saat taşımadan kaydediliyor", async () => {
    // Saat taşıyan bir kayıt, saat dilimi kaydırmasıyla komşu güne düşer ve iş
    // günü sayacı yanlış günü düşerdi.
    const row = await prisma.holiday.findFirst({
      where: { date: { gte: new Date(year, 0, 1), lte: new Date(year, 0, 2) } },
    });
    expect(row).not.toBeNull();
    expect(row!.date.getUTCHours()).toBe(0);
    expect(row!.date.getUTCMinutes()).toBe(0);
  });

  it("önerilen liste sabit tarihli millî günler — dinî bayram yok", async () => {
    const list = await callRoute(getHolidays, {
      url: `/api/admin/holidays?yil=${year}`,
      token: await bearer(admin),
    });
    const names: string[] = list.body.suggestions.map(
      (s: { name: string }) => s.name,
    );
    expect(names).toContain("Cumhuriyet Bayramı");
    expect(names.some((n) => /ramazan|kurban|bayram arife/i.test(n))).toBe(
      false,
    );
    // Hepsi istenen yılda, hepsi gün biçiminde.
    for (const s of list.body.suggestions as Array<{ date: string }>) {
      expect(s.date).toMatch(new RegExp(`^${year}-\\d{2}-\\d{2}$`));
    }
  });

  it("yıl verilmezse bu yıl", async () => {
    const res = await callRoute(getHolidays, {
      url: "/api/admin/holidays",
      token: await bearer(admin),
    });
    expect(res.body.year).toBe(new Date().getFullYear());
  });

  it("gün takvimden çıkarılabiliyor", async () => {
    const list = await callRoute(getHolidays, {
      url: `/api/admin/holidays?yil=${year}`,
      token: await bearer(admin),
    });
    const id = list.body.holidays[0].id;

    const gone = await callRoute(deleteHoliday, {
      url: `/api/admin/holidays/${id}`,
      method: "DELETE",
      token: await bearer(admin),
      params: { id },
    });
    expect(gone.status).toBe(204);

    const after = await callRoute(getHolidays, {
      url: `/api/admin/holidays?yil=${year}`,
      token: await bearer(admin),
    });
    expect(after.body.holidays).toHaveLength(0);
  });

  it("bozuk gün biçimi reddediliyor", async () => {
    const res = await callRoute(postHoliday, {
      url: "/api/admin/holidays",
      method: "POST",
      token: await bearer(admin),
      body: { date: "01.01.2031", name: "Yılbaşı", halfDay: false },
    });
    expect(res.status).toBe(400);
  });
});
