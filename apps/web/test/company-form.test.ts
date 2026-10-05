import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { PATCH as patchCompany } from "@/app/api/admin/companies/[id]/route";
import {
  GET as listDiscounts,
  POST as postDiscount,
} from "@/app/api/admin/companies/[id]/discounts/route";
import { DELETE as deleteDiscount } from "@/app/api/admin/discounts/[id]/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// D5 · firma formu, HTTP sınırından.
//
// Form sadeleşirken üç şey değişti ve üçü de sunucunun sözüne dayanıyor:
// - Hacim modülü kapalıyken form hacim alanlarını göndermiyor (depo gibi).
//   Gönderilmeyen alanın kayıtlı değeri kalmalı — yoksa görünmeyen bir alan
//   sözleşmeyle atanmış basamağı sessizce silerdi.
// - Asgari sipariş basit görünümde boşsa gizli; boş = genel kural (null),
//   0 = muaf. İkisi ayrı kalmalı.
// - Firmaya özel iskonto tek panelde; ekleme de silme de `pricing.manage`.
//   Önce ekleme `companies.manage` istiyordu.

const fx = new Fixtures("firmaform");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
let companyManager: TestUser;
let viewer: TestUser;
let companyId: string;
let categoryId: string;
let tierId: string;

suite("firma formu (HTTP)", () => {
  beforeAll(async () => {
    admin = await fx.user("SUPER_ADMIN");
    // Firmaları yönetir ama fiyata dokunamaz.
    companyManager = await fx.user("SUPER_ADMIN", {
      permissions: ["companies.view", "companies.manage"],
      label: "firmaci",
    });
    viewer = await fx.user("SUPER_ADMIN", {
      permissions: ["companies.view"],
      label: "firmaokur",
    });

    const groupId = await fx.group();
    companyId = await fx.company({ customerGroupId: groupId, creditLimit: 250_000 });
    ({ categoryId } = await fx.variant({ customerGroupId: groupId }));

    tierId = (
      await prisma.volumeTier.create({
        data: {
          name: `Altın ${fx.tag}`,
          minRevenue: 1_000_000,
          discountPercent: 4,
        },
        select: { id: true },
      })
    ).id;
    await prisma.company.update({
      where: { id: companyId },
      data: {
        volumeDiscountMode: "MANUAL",
        volumeTierId: tierId,
        paymentTermDays: 30,
        allowedPaymentMethods: ["OPEN_ACCOUNT"],
      },
    });
  });

  afterAll(async () => {
    await fx.teardown();
    await prisma.volumeTier.deleteMany({ where: { id: tierId } });
  });

  it("hacim alanı gönderilmeyen form kaydı elle atanmış basamağı korur", async () => {
    // Hacim modülü kapalıyken formun gönderdiği gövde: hacim ve depo yok.
    const res = await callRoute(patchCompany, {
      method: "PATCH",
      token: await bearer(admin),
      params: { id: companyId },
      body: {
        name: `Firma ${fx.tag} Ltd`,
        taxNumber: null,
        taxOffice: null,
        email: null,
        phone: "0362 000 00 00",
        creditLimit: 250_000,
        paymentTermDays: 45,
        minOrderAmount: null,
        requiresOrderApproval: false,
        isActive: true,
        customerGroupId: null,
        salesRepId: null,
        allowedPaymentMethods: ["OPEN_ACCOUNT"],
        paymentTermIds: [],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.company).toMatchObject({
      name: `Firma ${fx.tag} Ltd`,
      phone: "0362 000 00 00",
      paymentTermDays: 45,
      volumeDiscountMode: "MANUAL",
      volumeTier: { id: tierId },
    });
  });

  it("asgari sipariş: boş genel kural (null), 0 muaf — ikisi ayrı", async () => {
    const token = await bearer(admin);
    const exempt = await callRoute(patchCompany, {
      method: "PATCH",
      token,
      params: { id: companyId },
      body: { minOrderAmount: 0 },
    });
    expect(exempt.status).toBe(200);
    expect(Number(exempt.body.company.minOrderAmount)).toBe(0);

    const general = await callRoute(patchCompany, {
      method: "PATCH",
      token,
      params: { id: companyId },
      body: { minOrderAmount: null },
    });
    expect(general.status).toBe(200);
    expect(general.body.company.minOrderAmount).toBeNull();
  });

  it("salt okuma izniyle firma kaydedilemez", async () => {
    const res = await callRoute(patchCompany, {
      method: "PATCH",
      token: await bearer(viewer),
      params: { id: companyId },
      body: { name: "Değişmemeli" },
    });
    expect(res.status).toBe(403);
    const row = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    expect(row?.name).not.toBe("Değişmemeli");
  });

  it("firmaya özel iskonto: fiyat yetkisi olmayan ekleyemez", async () => {
    const res = await callRoute(postDiscount, {
      method: "POST",
      token: await bearer(companyManager),
      params: { id: companyId },
      body: { categoryId, discountType: "PERCENTAGE", value: 5 },
    });
    expect(res.status).toBe(403);
    expect(
      await prisma.companyDiscount.count({ where: { companyId } }),
    ).toBe(0);
  });

  it("firmaya özel iskonto: eklenir, listelenir, silinir", async () => {
    const token = await bearer(admin);
    const created = await callRoute(postDiscount, {
      method: "POST",
      token,
      params: { id: companyId },
      body: { categoryId, discountType: "PERCENTAGE", value: 5 },
    });
    expect(created.status).toBe(201);
    const id = created.body.discount.id as string;

    const listed = await callRoute(listDiscounts, {
      token,
      params: { id: companyId },
    });
    expect(listed.status).toBe(200);
    expect(listed.body.discounts).toHaveLength(1);
    expect(listed.body.discounts[0]).toMatchObject({ id, categoryId });

    const removed = await callRoute(deleteDiscount, {
      method: "DELETE",
      token,
      params: { id },
    });
    expect(removed.status).toBe(204);
    expect(
      await prisma.companyDiscount.count({ where: { companyId } }),
    ).toBe(0);
  });
});
