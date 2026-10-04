import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { GET as getFields } from "@/app/api/admin/custom-codes/route";
import { PUT as putField } from "@/app/api/admin/custom-codes/[entity]/[slot]/route";
import { GET as getCodeFilters } from "@/app/api/catalog/code-filters/route";
import { GET as getCatalog } from "@/app/api/catalog/route";
import { PATCH as patchProduct } from "@/app/api/admin/products/[id]/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Özel kod uçları.
//
// Üç kapı denetleniyor: tanımı **okumak** ürün/firma formunun izniyle yetiyor,
// **değiştirmek** yalnızca `organization.manage` istiyor; portal süzgeci de
// iç kullanım yuvasını adresten denemeye kapalı. Yuva 8 bu dosyanın; önceki
// hâli saklanıp sonunda geri konuyor (tanımlar kurulum geneli).

const fx = new Fixtures("ccode");
const suite = hasDb ? describe : describe.skip;
const SLOT = 8;

let admin: TestUser;
let catalogOnly: TestUser;
let buyer: TestUser;
let productId: string;
let categoryId: string;
let companyId: string;
let saved: Awaited<ReturnType<typeof prisma.customCodeField.findMany>> = [];

beforeAll(async () => {
  if (!hasDb) return;
  saved = await prisma.customCodeField.findMany({ where: { slot: SLOT } });
  await prisma.customCodeField.deleteMany({ where: { slot: SLOT } });

  admin = await fx.user("SUPER_ADMIN");
  // Aynı kabukta, ürünleri görebilen ama kuruluş ayarına dokunamayan biri.
  catalogOnly = await fx.user("SUPER_ADMIN", {
    permissions: ["products.view", "products.manage"],
    label: "katalogcu",
  });
  companyId = await fx.company();
  buyer = await fx.user("COMPANY_ADMIN", { companyId });
  ({ productId, categoryId } = await fx.variant());
});

afterAll(async () => {
  if (!hasDb) return;
  await prisma.customCodeField.deleteMany({ where: { slot: SLOT } });
  for (const row of saved) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...data } = row;
    await prisma.customCodeField.create({ data });
  }
  await fx.teardown();
});

suite("özel kod uçları", () => {
  it("kimliksiz istek 401", async () => {
    const res = await callRoute(getFields, { url: "/api/admin/custom-codes" });
    expect(res.status).toBe(401);
  });

  it("tanımı ürün izni olan okur, ama değiştiremez", async () => {
    const read = await callRoute(getFields, {
      url: "/api/admin/custom-codes",
      token: await bearer(catalogOnly),
    });
    expect(read.status).toBe(200);
    expect(read.body.fields.PRODUCT).toHaveLength(10);
    expect(read.body.fields.COMPANY).toHaveLength(10);

    const write = await callRoute(putField, {
      url: `/api/admin/custom-codes/PRODUCT/${SLOT}`,
      method: "PUT",
      token: await bearer(catalogOnly),
      params: { entity: "PRODUCT", slot: String(SLOT) },
      body: { label: "Raf" },
    });
    expect(write.status).toBe(403);
  });

  it("geçersiz varlık ya da yuva 400", async () => {
    for (const params of [
      { entity: "ORDER", slot: String(SLOT) },
      { entity: "PRODUCT", slot: "11" },
      { entity: "PRODUCT", slot: "abc" },
    ]) {
      const res = await callRoute(putField, {
        url: `/api/admin/custom-codes/${params.entity}/${params.slot}`,
        method: "PUT",
        token: await bearer(admin),
        params,
        body: { label: "Raf" },
      });
      expect(res.status).toBe(400);
    }
  });

  it("adsız tanım 400 ve Türkçe mesaj", async () => {
    const res = await callRoute(putField, {
      url: `/api/admin/custom-codes/PRODUCT/${SLOT}`,
      method: "PUT",
      token: await bearer(admin),
      params: { entity: "PRODUCT", slot: String(SLOT) },
      body: { label: "  " },
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("Alan adı gerekli");
  });

  it("listeli yuvaya listede olmayan değer 422", async () => {
    const saveRes = await callRoute(putField, {
      url: `/api/admin/custom-codes/PRODUCT/${SLOT}`,
      method: "PUT",
      token: await bearer(admin),
      params: { entity: "PRODUCT", slot: String(SLOT) },
      body: { label: `Segment ${fx.tag}`, options: ["BAYİ", "Perakende"] },
    });
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.field).toMatchObject({ slot: SLOT, isActive: true, defined: true });

    const bad = await callRoute(patchProduct, {
      url: `/api/admin/products/${productId}`,
      method: "PATCH",
      token: await bearer(admin),
      params: { id: productId },
      body: { [`code${SLOT}`]: "Toptan" },
    });
    expect(bad.status).toBe(422);

    const ok = await callRoute(patchProduct, {
      url: `/api/admin/products/${productId}`,
      method: "PATCH",
      token: await bearer(admin),
      params: { id: productId },
      body: { [`code${SLOT}`]: "bayi" },
    });
    expect(ok.status).toBe(200);
    const row = await prisma.product.findUnique({ where: { id: productId } });
    expect((row as Record<string, unknown>)[`code${SLOT}`]).toBe("BAYİ");
  });

  it("portal: süzgeçte gösterilmeyen yuva adresten denenemez", async () => {
    const url = `/api/catalog?companyId=${companyId}&categoryId=${categoryId}&kod${SLOT}=YOKBOYLE`;
    // Yuva katalogda gösterilmiyor: süzgeç yok sayılır, ürün yine listelenir.
    const hidden = await callRoute(getCatalog, { url, token: await bearer(buyer) });
    expect(hidden.status).toBe(200);
    expect(hidden.body.products).toHaveLength(1);

    const filters = await callRoute(getCodeFilters, {
      url: "/api/catalog/code-filters",
      token: await bearer(buyer),
    });
    expect(filters.status).toBe(200);
    expect(filters.body.filters.some((f: { key: string }) => f.key === `code${SLOT}`)).toBe(false);

    await callRoute(putField, {
      url: `/api/admin/custom-codes/PRODUCT/${SLOT}`,
      method: "PUT",
      token: await bearer(admin),
      params: { entity: "PRODUCT", slot: String(SLOT) },
      body: {
        label: `Segment ${fx.tag}`,
        options: ["BAYİ", "Perakende"],
        showInCatalogFilter: true,
      },
    });

    const shown = await callRoute(getCatalog, { url, token: await bearer(buyer) });
    expect(shown.body.products).toHaveLength(0);
    const match = await callRoute(getCatalog, {
      url: `/api/catalog?companyId=${companyId}&categoryId=${categoryId}&kod${SLOT}=bayi`,
      token: await bearer(buyer),
    });
    expect(match.body.products).toHaveLength(1);
  });
});
