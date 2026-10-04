import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { saveCustomCodeFieldSchema } from "@repo/types";
import {
  describeDatasetsWithCodes,
  listCatalogCodeFilters,
  listCustomCodeFields,
  normalizeCustomCodes,
  saveCustomCodeField,
} from "../../src/custom-codes";
import {
  createProduct,
  getProductAdmin,
  listProductsAdmin,
  updateProduct,
} from "../../src/catalog-admin";
import { createCompany, listCompanies, updateCompany } from "../../src/company-admin";
import { listCatalog } from "../../src/catalog";
import { runReport } from "../../src/report-engine";
import { BusinessError } from "../../src/errors";

// Özel kodlar — ürüne ve firmaya 10'ar sınıflandırma alanı.
//
// Kanıtlanacak iddialar:
//
//  1. Seçenek listesi yazarken denetleniyor ve **listedeki yazım** kaydediliyor
//     ("bayi" yazan "BAYİ" segmentine düşer, yeni bir segment açmaz).
//  2. Gönderilmeyen yuva değişmiyor, boş gönderilen temizleniyor.
//  3. Portal kataloğu yalnızca "katalogda göster" işaretli yuvada süzüyor —
//     iç kullanım kodu (tedarikçi, raf) adresten denenerek sızdırılamaz.
//  4. Liste daraltıldığında eski değerler silinmiyor, yalnızca sayılıyor.
//
// Tanımlar kurulum geneli (hacim merdiveni gibi): bu paket yuva 9 ve 10'u
// kullanıyor, önceki hâllerini saklıyor ve sonunda aynen geri koyuyor.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `cc${Date.now()}`;
const SLOTS = [9, 10] as const;

let categoryId: string;
let companyId: string;
const productIds: string[] = [];
const companyIds: string[] = [];
let saved: Awaited<ReturnType<typeof prisma.customCodeField.findMany>> = [];

const field = (input: Record<string, unknown>) => saveCustomCodeFieldSchema.parse(input);

suite("özel kodlar integration", () => {
  beforeAll(async () => {
    saved = await prisma.customCodeField.findMany({ where: { slot: { in: [...SLOTS] } } });
    await prisma.customCodeField.deleteMany({ where: { slot: { in: [...SLOTS] } } });

    categoryId = (
      await prisma.category.create({ data: { name: `Kod ${TAG}`, slug: `kod-${TAG}` } })
    ).id;
    // Katalog listesi bir firmanın gözünden çiziliyor; fiyatı olmasa da ürün görünür.
    companyId = (await prisma.company.create({ data: { name: `Kod alıcı ${TAG}` } })).id;
    companyIds.push(companyId);
  });

  afterAll(async () => {
    if (!hasDb) return;
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.customCodeField.deleteMany({ where: { slot: { in: [...SLOTS] } } });
    for (const row of saved) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...data } = row;
      await prisma.customCodeField.create({ data });
    }
  });

  it("tanımsız yuvalar da listelenir, pasif ve varsayılan adla", async () => {
    const fields = await listCustomCodeFields("PRODUCT");
    expect(fields).toHaveLength(10);
    const ten = fields.find((f) => f.slot === 10)!;
    expect(ten).toMatchObject({ defined: false, isActive: false, label: "Özel kod 10", key: "code10" });
  });

  it("seçenekler kırpılır, boşlar atılır, harf farkıyla tekrar edenler birleşir", () => {
    const parsed = field({ label: "Segment", options: [" BAYİ ", "", "bayi", "Perakende"] });
    expect(parsed.options).toEqual(["BAYİ", "Perakende"]);
  });

  it("listeli yuvada değer listedeki yazımla kaydedilir, listede olmayan reddedilir", async () => {
    await saveCustomCodeField("PRODUCT", 9, field({ label: `Segment ${TAG}`, options: ["BAYİ", "Perakende"] }));

    await expect(normalizeCustomCodes("PRODUCT", { code9: "bayi" })).resolves.toEqual({ code9: "BAYİ" });
    await expect(normalizeCustomCodes("PRODUCT", { code9: "Toptan" })).rejects.toMatchObject({
      code: "INVALID_CUSTOM_CODE",
    });
    await expect(normalizeCustomCodes("PRODUCT", { code9: "" })).resolves.toEqual({ code9: null });
    // Gönderilmeyen yuva sonuçta yok: güncelleme ona dokunmayacak.
    await expect(normalizeCustomCodes("PRODUCT", {})).resolves.toEqual({});
  });

  it("ürün kodları kaydedilir, gönderilmeyen yuva korunur, liste süzgeci harf duyarsız", async () => {
    await saveCustomCodeField("PRODUCT", 10, field({ label: `Raf ${TAG}` }));

    const a = await createProduct({
      name: `Kodlu ürün A ${TAG}`,
      categoryId,
      images: [],
      vatRate: 20,
      isActive: true,
      code9: "perakende",
      code10: "R-12",
    });
    productIds.push(a.id);
    const b = await createProduct({
      name: `Kodlu ürün B ${TAG}`,
      categoryId,
      images: [],
      vatRate: 20,
      isActive: true,
      code9: "BAYİ",
    });
    productIds.push(b.id);

    expect((await getProductAdmin(a.id)).codes).toMatchObject({ code9: "Perakende", code10: "R-12" });

    // Yalnızca raf değişiyor; segment gönderilmediği için yerinde kalmalı.
    await updateProduct(a.id, { code10: "R-14" });
    expect((await getProductAdmin(a.id)).codes).toMatchObject({ code9: "Perakende", code10: "R-14" });

    const filtered = await listProductsAdmin({ categoryId, codes: { code9: "perakende" } });
    expect(filtered.map((p) => p.id)).toEqual([a.id]);

    // Türkçe İ: Postgres'in harf duyarsız eşleşmesi "bayi" ile "BAYİ"yi
    // eşlemiyor (LOWER('İ') ≠ 'i'). Süzgeç Türkçe yazımları ayrıca deniyor.
    const turkish = await listProductsAdmin({ categoryId, codes: { code9: "bayi" } });
    expect(turkish.map((p) => p.id)).toEqual([b.id]);
  });

  it("portal kataloğu yalnızca katalogda gösterilen yuvada süzer", async () => {
    // Raf (yuva 10) iç kullanım: işaretli değil. Adresten denense de süzmez —
    // kategori içindeki iki ürün de dönmeli.
    const hidden = await listCatalog({ companyId, categoryId, codes: { code10: "R-14" } });
    expect(hidden.map((p) => p.name).sort()).toEqual(
      [`Kodlu ürün A ${TAG}`, `Kodlu ürün B ${TAG}`].sort(),
    );

    await saveCustomCodeField(
      "PRODUCT",
      9,
      field({ label: `Segment ${TAG}`, options: ["BAYİ", "Perakende"], showInCatalogFilter: true }),
    );
    const shown = await listCatalog({ companyId, categoryId, codes: { code9: "BAYİ" } });
    expect(shown.map((p) => p.name)).toEqual([`Kodlu ürün B ${TAG}`]);

    const filters = await listCatalogCodeFilters();
    const segment = filters.find((f) => f.key === "code9");
    expect(segment?.values).toEqual(["BAYİ", "Perakende"]);
    expect(filters.some((f) => f.key === "code10")).toBe(false);
  });

  it("listesiz süzgeç, aktif ürünlerde geçen değerleri önerir", async () => {
    await saveCustomCodeField("PRODUCT", 10, field({ label: `Raf ${TAG}`, showInCatalogFilter: true }));
    const filters = await listCatalogCodeFilters();
    expect(filters.find((f) => f.key === "code10")?.values).toContain("R-14");
  });

  it("liste daraltılınca eski değerler silinmez, yalnızca sayılır", async () => {
    const result = await saveCustomCodeField(
      "PRODUCT",
      9,
      field({ label: `Segment ${TAG}`, options: ["BAYİ"] }),
    );
    // A ürünü "Perakende" taşıyor — artık listede değil ama yerinde.
    expect(result.outsideOptions).toBeGreaterThanOrEqual(1);
    expect((await getProductAdmin(productIds[0]!)).codes.code9).toBe("Perakende");
  });

  it("firma kodları kaydedilir ve firma listesi onlarla süzülür", async () => {
    await saveCustomCodeField("COMPANY", 9, field({ label: `Bölge ${TAG}`, options: ["Ege", "Marmara"] }));
    const ege = await createCompany({
      name: `Ege bayi ${TAG}`,
      creditLimit: 0,
      paymentTermDays: 0,
      requiresOrderApproval: false,
      isActive: true,
      allowedPaymentMethods: [],
      paymentTermIds: [],
      volumeDiscountMode: "AUTO",
      code9: "ege",
    });
    companyIds.push(ege.id);
    expect(ege.codes.code9).toBe("Ege");

    await expect(updateCompany(ege.id, { code9: "Karadeniz" })).rejects.toBeInstanceOf(BusinessError);

    const list = await listCompanies({ codes: { code9: "EGE" } });
    expect(list.map((c) => c.id)).toContain(ege.id);
    expect(list.every((c) => c.codes.code9 === "Ege")).toBe(true);
  });

  it("firma alanı katalog süzgecine işaretlenemez", async () => {
    const { field: saved } = await saveCustomCodeField(
      "COMPANY",
      10,
      field({ label: `Kanal ${TAG}`, showInCatalogFilter: true }),
    );
    expect(saved.showInCatalogFilter).toBe(false);
  });

  it("rapor tasarımcısı kodları kurulumun adıyla gösterir, kullanılmayanı gizler", async () => {
    await saveCustomCodeField("COMPANY", 10, field({ label: `Kanal ${TAG}`, isActive: false }));
    const datasets = await describeDatasetsWithCodes();
    const companies = datasets.find((d) => d.key === "COMPANIES")!;
    const nine = companies.fields.find((f) => f.key === "company_code9");
    expect(nine?.label).toBe(`Bölge ${TAG}`);
    expect(companies.fields.some((f) => f.key === "company_code10")).toBe(false);

    const items = datasets.find((d) => d.key === "ORDER_ITEMS")!;
    expect(items.fields.find((f) => f.key === "product_code9")?.label).toBe(`Segment ${TAG}`);
  });

  it("firma özel koduyla gruplanmış rapor veritabanında çalışır", async () => {
    // Alan yeni bir JOIN eklemiyor; COMPANIES kümesinde kök kolon. Gruplu rapor
    // SQL'e gidiyor ve yolun çözüldüğü yer orası — kayıt defteri testinin
    // göremeyeceği şey.
    const result = await runReport(
      "COMPANIES",
      {
        columns: [{ field: "company_code9" }, { field: "name", aggregate: "COUNT" }],
        filters: [{ field: "company_code9", operator: "eq", value: "Ege" }],
        groupBy: ["company_code9"],
        sort: [{ field: "company_code9", direction: "asc" }],
      },
      { userId: "test", role: "SUPER_ADMIN", companyId: null },
    );
    expect(result.grouped).toBe(true);
    expect(result.rows).toEqual([
      expect.objectContaining({ company_code9: "Ege", name__count: expect.any(Number) }),
    ]);
  });
});
