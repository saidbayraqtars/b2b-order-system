import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  getPageLayout,
  listBlockCatalog,
  resetPageLayout,
  savePageLayout,
} from "../../src/page-layout";

// Sayfa düzeni.
//
// Kanıtlanacak iddia: **kayıt defteri sınırdır.** Tanınmayan blok yazılamaz;
// kayıtta duran tanınmayan blok ise vitrini düşürmez, yalnızca çizilmez. Bir de
// "kaydı olmayan sayfa" hâli: varsayılan düzen bugüne kadarki sıranın kendisi
// olmalı, boş liste değil — yoksa yükselten kurulumda vitrin bomboş açılırdı.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `pl${Date.now()}`;
let actorId: string;

suite("sayfa düzeni integration", () => {
  beforeEach(async () => {
    if (!actorId) {
      actorId = (
        await prisma.user.create({
          data: {
            email: `design-${TAG}@test.local`,
            name: "Düzen Admini",
            passwordHash: "x",
            role: "SUPER_ADMIN",
          },
        })
      ).id;
    }
    // Her test kaydı olmayan bir sayfayla başlıyor: takımın kendi sırası,
    // öncekinden kalan bir düzenle karışmasın.
    await prisma.pageLayout.deleteMany({ where: { key: "PORTAL_HOME" } });
  });

  afterAll(async () => {
    await prisma.pageLayout.deleteMany({ where: { key: "PORTAL_HOME" } });
    await prisma.user.deleteMany({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  describe("kayıt yokken", () => {
    it("varsayılan düzeni verir ve bunu söyler", async () => {
      const layout = await getPageLayout("PORTAL_HOME");
      expect(layout.isDefault).toBe(true);
      expect(layout.blocks.map((b) => b.type)).toEqual([
        "ANNOUNCEMENTS",
        "SEARCH_BAR",
        "CATEGORY_SIDEBAR",
        "PRODUCT_GRID",
        "CART_PANEL",
      ]);
      expect(layout.blocks.every((b) => b.enabled)).toBe(true);
    });
  });

  describe("kayıt defteri sınırdır", () => {
    it("tanınmayan blok reddedilir", async () => {
      // Okurken atılıyor ama yazarken **reddediliyor**: sessizce yutmak,
      // kullanıcının eklediği bloğun sebebi söylenmeden kaybolması olurdu.
      await expect(
        savePageLayout(
          "PORTAL_HOME",
          {
            blocks: [
              { type: "PRODUCT_GRID", params: {}, enabled: true },
              { type: "GIZLI_BLOK", params: {}, enabled: true },
            ],
          },
          actorId,
        ),
      ).rejects.toMatchObject({ code: "INVALID_BLOCK" });
    });

    it("aynı blok iki kez konamaz", async () => {
      await expect(
        savePageLayout(
          "PORTAL_HOME",
          {
            blocks: [
              { type: "PRODUCT_GRID", params: {}, enabled: true },
              { type: "PRODUCT_GRID", params: {}, enabled: true },
            ],
          },
          actorId,
        ),
      ).rejects.toMatchObject({ code: "INVALID_BLOCK" });
    });

    it("zorunlu blok kaldırılamaz ve kapatılamaz", async () => {
      await expect(
        savePageLayout(
          "PORTAL_HOME",
          { blocks: [{ type: "CART_PANEL", params: {}, enabled: true }] },
          actorId,
        ),
      ).rejects.toMatchObject({ code: "INVALID_BLOCK" });

      await expect(
        savePageLayout(
          "PORTAL_HOME",
          { blocks: [{ type: "PRODUCT_GRID", params: {}, enabled: false }] },
          actorId,
        ),
      ).rejects.toMatchObject({ code: "INVALID_BLOCK" });
    });

    it("bilinmeyen ayar atılır, sayı aralığa kırpılır", async () => {
      const saved = await savePageLayout(
        "PORTAL_HOME",
        {
          blocks: [
            {
              type: "PRODUCT_GRID",
              // 99 sütun diye bir şey yok; "sqlInjection" diye bir ayar da.
              params: { columns: 99, sqlInjection: "DROP TABLE" },
              enabled: true,
            },
          ],
        },
        actorId,
      );
      const grid = saved.blocks.find((b) => b.type === "PRODUCT_GRID")!;
      expect(grid.params.columns).toBe(4);
      expect(grid.params.sqlInjection).toBeUndefined();
    });
  });

  describe("sıra ve kapatma", () => {
    it("kaydedilen sıra geri okunur", async () => {
      await savePageLayout(
        "PORTAL_HOME",
        {
          blocks: [
            { type: "SEARCH_BAR", params: {}, enabled: true },
            { type: "ANNOUNCEMENTS", params: {}, enabled: false },
            { type: "PRODUCT_GRID", params: { columns: 2 }, enabled: true },
          ],
        },
        actorId,
      );

      const layout = await getPageLayout("PORTAL_HOME");
      expect(layout.isDefault).toBe(false);
      expect(layout.updatedByName).toBe("Düzen Admini");
      expect(layout.blocks.map((b) => b.type)).toEqual([
        "SEARCH_BAR",
        "ANNOUNCEMENTS",
        "PRODUCT_GRID",
      ]);
      // Kapalı blok listede **duruyor**: silmek ayarlarını da götürürdü.
      expect(layout.blocks.find((b) => b.type === "ANNOUNCEMENTS")!.enabled).toBe(
        false,
      );
    });

    it("varsayılana dönüş kaydı siler", async () => {
      await savePageLayout(
        "PORTAL_HOME",
        { blocks: [{ type: "PRODUCT_GRID", params: {}, enabled: true }] },
        actorId,
      );
      const back = await resetPageLayout("PORTAL_HOME");
      expect(back.isDefault).toBe(true);
      expect(back.blocks).toHaveLength(5);
    });
  });

  describe("bozuk kayıt vitrini düşürmez", () => {
    it("tanınmayan blok çizilmez, zorunlu blok geri konur", async () => {
      // Veritabanına elle yazılmış (ya da eski bir sürümden kalmış) kayıt.
      await prisma.pageLayout.create({
        data: {
          key: "PORTAL_HOME",
          blocks: [
            { type: "ESKI_KAMPANYA_BANDI", params: {}, enabled: true },
            { type: "SEARCH_BAR", params: {}, enabled: true },
            "bu bir nesne bile değil",
          ],
          updatedById: actorId,
        },
      });

      const layout = await getPageLayout("PORTAL_HOME");
      expect(layout.blocks.map((b) => b.type)).toEqual([
        "SEARCH_BAR",
        // Ürün ızgarası kayıtta yoktu; ürünsüz vitrin açılmamalı.
        "PRODUCT_GRID",
      ]);
    });

    it("dizi olmayan kayıt varsayılana düşer", async () => {
      await prisma.pageLayout.create({
        data: { key: "PORTAL_HOME", blocks: { bozuk: true }, updatedById: actorId },
      });
      const layout = await getPageLayout("PORTAL_HOME");
      expect(layout.blocks).toHaveLength(5);
    });
  });

  describe("katalog", () => {
    it("her blok bölgesini ve zorunluluğunu bildirir", async () => {
      const catalog = listBlockCatalog("PORTAL_HOME");
      const grid = catalog.find((c) => c.type === "PRODUCT_GRID")!;
      expect(grid.required).toBe(true);
      expect(grid.region).toBe("row");
      expect(catalog.find((c) => c.type === "ANNOUNCEMENTS")!.region).toBe("stack");
    });
  });
});
