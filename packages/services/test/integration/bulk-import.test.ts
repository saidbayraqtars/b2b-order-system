import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { applyImport, planImport } from "../../src/bulk-import";
import { buildXlsx } from "../../src/xlsx";
import { readSpreadsheet, parseDecimal } from "../../src/xlsx-read";

// Excel ile toplu güncelleme, gerçek veritabanına karşı.
//
// Kanıtlaması gereken iddia tek: **önizlemesiz uygulama yok, ve uygulanan şey
// önizlenen şeydir.** Bir zam listesinin yanlış uygulanması bu depodaki en
// pahalı hatalardan biri — bütün katalog bir kuruşa satılabilir.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `imp${Date.now()}`;
const SKU_A = `${TAG}-A`;
const SKU_B = `${TAG}-B`;

let categoryId: string;
let productId: string;
let variantAId: string;
let variantBId: string;
let groupId: string;
let adminId: string;

function priceFile(rows: Array<[string, string | null, number, number]>): Buffer {
  return Buffer.from(
    buildXlsx(
      "Fiyat",
      [
        { label: "SKU" },
        { label: "Grup" },
        { label: "Min adet" },
        { label: "Fiyat" },
      ],
      rows.map((r) => [...r]),
    ),
  );
}

async function priceOf(variantId: string, customerGroupId: string | null) {
  const row = await prisma.price.findFirst({
    where: { variantId, customerGroupId, minQuantity: 1 },
    select: { price: true },
  });
  return row ? Number(row.price) : null;
}

suite("toplu içe aktarma", () => {
  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `${TAG}@test.local`,
        name: `Aktarma ${TAG}`,
        passwordHash: "x",
        role: "SUPER_ADMIN",
        permissions: [],
      },
      select: { id: true },
    });
    adminId = admin.id;

    const group = await prisma.customerGroup.create({
      data: { name: `Grup ${TAG}` },
      select: { id: true },
    });
    groupId = group.id;

    const category = await prisma.category.create({
      data: { name: `Kategori ${TAG}`, slug: `kategori-${TAG}` },
      select: { id: true },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        name: `Ürün ${TAG}`,
        slug: `urun-${TAG}`,
        categoryId,
        vatRate: 20,
        variants: {
          create: [
            { sku: SKU_A, stock: 100 },
            { sku: SKU_B, stock: 40 },
          ],
        },
      },
      select: { id: true, variants: { select: { id: true, sku: true } } },
    });
    productId = product.id;
    variantAId = product.variants.find((v) => v.sku === SKU_A)!.id;
    variantBId = product.variants.find((v) => v.sku === SKU_B)!.id;

    // A'nın liste fiyatı var, B'nin yok: biri güncellenecek, biri açılacak.
    await prisma.price.create({
      data: { variantId: variantAId, minQuantity: 1, price: 100 },
    });
  });

  afterAll(async () => {
    if (!hasDb) return;
    await prisma.stockMovement.deleteMany({
      where: { variantId: { in: [variantAId, variantBId] } },
    });
    await prisma.price.deleteMany({
      where: { variantId: { in: [variantAId, variantBId] } },
    });
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
  });

  describe("fark önizlemesi", () => {
    it("her satırı dört durumdan birine ayırıyor", async () => {
      const file = priceFile([
        [SKU_A, null, 1, 150], // 100 → 150: değişecek
        [SKU_B, null, 1, 75], // fiyatı yok: yeni satır
        [SKU_A, null, 1, 150], // aynı dosyada tekrar: yine değişecek sayılır
        ["YOK-" + TAG, null, 1, 10], // tanınmayan SKU
        [SKU_A, "Olmayan Grup", 1, 90], // tanınmayan grup
      ]);

      const plan = await planImport("PRICE", file);
      expect(plan.counts.update).toBe(2);
      expect(plan.counts.create).toBe(1);
      expect(plan.counts["unknown-sku"]).toBe(1);
      expect(plan.counts["unknown-group"]).toBe(1);
      expect(plan.totalRows).toBe(5);
    });

    it("aynı fiyat 'değişecek' saymıyor", async () => {
      const plan = await planImport("PRICE", priceFile([[SKU_A, null, 1, 100]]));
      expect(plan.counts.unchanged).toBe(1);
      expect(plan.counts.update).toBe(0);
    });

    it("sütunlar sıraya göre değil ada göre bulunuyor", async () => {
      // Kullanıcı Excel'de kolon taşıdı: fiyat başta, SKU sonda.
      const file = Buffer.from(
        buildXlsx(
          "Fiyat",
          [{ label: "Fiyat" }, { label: "Açıklama" }, { label: "Stok kodu" }],
          [[199, "not", SKU_A]],
        ),
      );
      const plan = await planImport("PRICE", file);
      expect(plan.counts.update).toBe(1);
      expect(plan.priceRows?.[0]?.newPrice).toBe(199);
    });

    it("başlık tanınmazsa okunabilir bir hata veriyor", async () => {
      const file = Buffer.from(
        buildXlsx("Fiyat", [{ label: "Bir" }, { label: "İki" }], [["a", "b"]]),
      );
      await expect(planImport("PRICE", file)).rejects.toThrow(/sütunları bulunamadı/);
    });
  });

  describe("önizlemesiz uygulama yok", () => {
    it("yanlış imza reddediliyor", async () => {
      const file = priceFile([[SKU_A, null, 1, 175]]);
      await expect(
        applyImport("PRICE", file, "uydurma-imza", adminId),
      ).rejects.toThrow(/Önizlemeden sonra veriler değişti/);
      // Ve hiçbir şey uygulanmadı.
      expect(await priceOf(variantAId, null)).toBe(100);
    });

    it("dosya önizlemeden sonra değişirse imza tutmuyor", async () => {
      const previewed = priceFile([[SKU_A, null, 1, 175]]);
      const plan = await planImport("PRICE", previewed);

      // Aynı imzayla başka bir dosya gönderiliyor — asıl saldırı bu.
      const swapped = priceFile([[SKU_A, null, 1, 1]]);
      await expect(
        applyImport("PRICE", swapped, plan.signature, adminId),
      ).rejects.toThrow(/Önizlemeden sonra veriler değişti/);
      expect(await priceOf(variantAId, null)).toBe(100);
    });

    it("veritabanı önizlemeden sonra değişirse imza tutmuyor", async () => {
      const file = priceFile([[SKU_A, null, 1, 175]]);
      const plan = await planImport("PRICE", file);

      // Araya başka biri girdi.
      await prisma.price.updateMany({
        where: { variantId: variantAId, customerGroupId: null, minQuantity: 1 },
        data: { price: 120 },
      });

      await expect(
        applyImport("PRICE", file, plan.signature, adminId),
      ).rejects.toThrow(/Önizlemeden sonra veriler değişti/);
      expect(await priceOf(variantAId, null)).toBe(120);

      await prisma.price.updateMany({
        where: { variantId: variantAId, customerGroupId: null, minQuantity: 1 },
        data: { price: 100 },
      });
    });
  });

  describe("uygulama", () => {
    it("doğru imzayla güncelliyor ve eksik satırı açıyor", async () => {
      const file = priceFile([
        [SKU_A, null, 1, 150],
        [SKU_B, null, 1, 75],
        ["YOK-" + TAG, null, 1, 10],
      ]);
      const plan = await planImport("PRICE", file);
      const result = await applyImport("PRICE", file, plan.signature, adminId);

      expect(result.applied).toBe(2);
      expect(result.skipped).toBe(1);
      expect(await priceOf(variantAId, null)).toBe(150);
      expect(await priceOf(variantBId, null)).toBe(75);
    });

    it("stok sayımı defterden geçiyor, kolona yazmıyor", async () => {
      const file = Buffer.from(
        buildXlsx(
          "Stok",
          [{ label: "SKU" }, { label: "Sayılan stok" }],
          [
            [SKU_A, 90],
            [SKU_B, 40],
          ],
        ),
      );

      const plan = await planImport("STOCK", file);
      expect(plan.counts.update).toBe(1); // A: 100 → 90
      expect(plan.counts.unchanged).toBe(1); // B: aynı

      await applyImport("STOCK", file, plan.signature, adminId);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantAId },
        select: { stock: true },
      });
      expect(Number(variant.stock)).toBe(90);

      // Asıl iddia: fark bir **hareket** olarak yazıldı (Adım 51 tek kapı).
      const movements = await prisma.stockMovement.findMany({
        where: { variantId: variantAId },
        select: { direction: true, quantity: true, source: true, balanceAfter: true },
      });
      expect(movements).toHaveLength(1);
      expect({
        ...movements[0],
        quantity: Number(movements[0]!.quantity),
        balanceAfter: Number(movements[0]!.balanceAfter),
      }).toMatchObject({
        direction: "OUT",
        quantity: 10,
        source: "COUNT",
        balanceAfter: 90,
      });
    });
  });
});

describe("çalışma sayfası okuyucusu", () => {
  it("yazıcının ürettiğini geri okuyor", () => {
    const file = Buffer.from(
      buildXlsx(
        "Test",
        [{ label: "Metin" }, { label: "Sayı" }],
        [["Türkçe ĞÜŞİÖÇ & <xml>", 129.9]],
      ),
    );
    const rows = readSpreadsheet(file);
    expect(rows[0]).toEqual(["Metin", "Sayı"]);
    expect(rows[1]).toEqual(["Türkçe ĞÜŞİÖÇ & <xml>", 129.9]);
  });

  it("noktalı virgüllü CSV'yi ve tırnaklı alanı okuyor", () => {
    const csv = Buffer.from('SKU;Ad\r\nA-1;"Bir; iki"\r\n', "utf8");
    expect(readSpreadsheet(csv)).toEqual([
      ["SKU", "Ad"],
      ["A-1", "Bir; iki"],
    ]);
  });

  it("Türkçe ondalık ve bin ayracını çözüyor", () => {
    expect(parseDecimal("1.234,56")).toBeCloseTo(1234.56);
    expect(parseDecimal("1,5")).toBeCloseTo(1.5);
    // Belirsiz durum: üç haneli grup bin ayracı sayılıyor.
    expect(parseDecimal("1.234")).toBe(1234);
    expect(parseDecimal("1.5")).toBeCloseTo(1.5);
    expect(parseDecimal("abc")).toBeNull();
  });

  it("Excel dosyası olmayan bir şeyi CSV sanmıyor", () => {
    // ZIP imzalı ama bozuk: sessizce yanlış ayrıştırmak yerine hata.
    const broken = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(() => readSpreadsheet(broken)).toThrow();
  });
});
