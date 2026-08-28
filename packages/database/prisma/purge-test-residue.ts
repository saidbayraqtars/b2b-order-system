/* eslint-disable no-console */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

// Testlerin gösterim veritabanında bıraktığı artığı temizler.
//
// Testler artık ayrı bir şemada koşuyor (bkz. `src/test-env.ts`), yani bu betik
// **geçmişi** temizlemek için: ayrım konmadan önce biriken satırlar. Bir daha
// gerekmemesi beklenir; yine de duruyor, çünkü `DATABASE_URL`i elle verip
// testleri yanlış şemaya koşturmak her zaman mümkün.
//
// Varsayılan kip **kuru**: ne silineceğini yazar, hiçbir şeye dokunmaz.
// Silmek için `--apply`.
//
//   pnpm db:purge-test-residue                      # ne var, ne yok
//   pnpm db:purge-test-residue --apply              # sil
//   pnpm db:purge-test-residue --orphans --apply    # sahipsizleri de
//
// **Birinci imza kesin.** Fixture'ların açtığı her kullanıcının e-postası
// `@test.local` ile bitiyor ve açtığı her satırın adında o koşunun etiketi
// geçiyor (`Firma rmamta0tv5755`). Etiketler e-postalardan çıkarılıyor, sonra
// ada göre eşleşen satırlar toplanıyor — tahmin yok, ölçüt veritabanının kendi
// içinden geliyor.
//
// **İkinci imza tahmin, o yüzden bayrağın arkasında.** Kullanıcıları temizlenmiş
// ama katalog satırları kalmış eski koşular var (`S7 Kategori`,
// `Kategori cash1786109339140`); onları bir etikete bağlamanın yolu yok, geriye
// yalnızca fixture'ların kullandığı ad kalıbı kalıyor. `--orphans` bunları
// **tek tek yazdırıp** siliyor ve sipariş satırı olan hiçbirine dokunmuyor —
// gerçek bir kataloğun ürünü er geç satılmıştır.

const prisma = new PrismaClient();

/** Kısa bir etiket gerçek veriyle çakışabilir; altı karakterden kısa olan alınmaz. */
const MIN_TAG = 6;

/** Fixture'ların kullandığı ad önekleri — ikinci imza yalnızca bunlara bakıyor. */
const ORPHAN_PREFIXES = ["Kategori ", "Ürün ", "Grup ", "S7 "];

function loadEnv(): void {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(__dirname, "../.env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

/** `plasiyer-acctmtbh3rwy588@test.local` → `acctmtbh3rwy588` */
function tagOf(email: string): string | null {
  const local = email.slice(0, email.indexOf("@"));
  const dash = local.lastIndexOf("-");
  const tag = dash === -1 ? local : local.slice(dash + 1);
  return tag.length >= MIN_TAG ? tag : null;
}

async function main(): Promise<void> {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const orphans = process.argv.includes("--orphans");

  // Bu betik geliştirme/gösterim veritabanı içindir. Üretimde bir müşterinin
  // kataloğunda "Kategori …" diye bir satır varsa o gerçek bir satırdır.
  if (process.env.NODE_ENV === "production") {
    console.error("HATA: üretimde çalıştırılamaz.");
    process.exit(1);
  }

  const users = await prisma.user.findMany({
    where: { email: { endsWith: "@test.local" } },
    select: { id: true, email: true },
  });

  const tags = [...new Set(users.map((u) => tagOf(u.email)).filter(Boolean))] as string[];
  const nameContainsTag = tags.map((t) => ({ name: { contains: t } }));

  const [companies, categories, products, groups] = await Promise.all([
    tags.length
      ? prisma.company.findMany({
          where: { OR: nameContainsTag },
          select: { id: true, name: true },
        })
      : [],
    tags.length
      ? prisma.category.findMany({
          where: { OR: nameContainsTag },
          select: { id: true, name: true },
        })
      : [],
    tags.length
      ? prisma.product.findMany({
          where: { OR: nameContainsTag },
          select: { id: true, name: true },
        })
      : [],
    tags.length
      ? prisma.customerGroup.findMany({
          where: { OR: nameContainsTag },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const orphanRows = orphans ? await findOrphans(tags) : null;

  console.log("Test artığı:");
  console.log(`  kullanıcı        ${users.length}`);
  console.log(`  firma            ${companies.length}`);
  console.log(`  kategori         ${categories.length}`);
  console.log(`  ürün             ${products.length}`);
  console.log(`  müşteri grubu    ${groups.length}`);
  console.log(`  koşu etiketi     ${tags.length}`);

  if (orphanRows) {
    console.log("\nSahipsiz katalog satırları (ikinci imza):");
    for (const row of orphanRows.list) {
      console.log(`  ${row.kind.padEnd(9)} ${row.name}`);
    }
    if (orphanRows.list.length === 0) console.log("  yok");
  } else {
    console.log("\n(Sahipsiz satırlar taranmadı — `--orphans` ile tarayın.)");
  }

  const total =
    users.length +
    companies.length +
    categories.length +
    products.length +
    groups.length +
    (orphanRows?.list.length ?? 0);
  if (total === 0) {
    console.log("\n✓ Temiz.");
    await prisma.$disconnect();
    return;
  }

  if (!apply) {
    console.log("\nKuru kip — hiçbir şey silinmedi. Silmek için: --apply");
    await prisma.$disconnect();
    return;
  }

  const userId = { in: users.map((u) => u.id) };
  const companyId = { in: companies.map((c) => c.id) };
  const productIds = products.map((p) => p.id);

  // Sıra `apps/web/test/harness.ts` içindeki `teardown()` ile birebir aynı:
  // çocuklar önce. Yabancı anahtarların yarısı `onDelete: Cascade` değil ve
  // sıra bozulunca silme kısıt hatasıyla yarıda kalıyor.
  await prisma.auditLog.deleteMany({ where: { actorId: userId } });
  await prisma.cartItem.deleteMany({ where: { cart: { companyId } } });
  await prisma.cart.deleteMany({ where: { companyId } });
  await prisma.checkIn.deleteMany({ where: { companyId } });
  await prisma.visitRequest.deleteMany({ where: { companyId } });
  await prisma.salesTarget.deleteMany({ where: { salesRepId: userId } });
  await prisma.returnItem.deleteMany({
    where: { returnRequest: { companyId } },
  });
  await prisma.returnRequest.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({
    where: {
      OR: [
        { order: { companyId } },
        { recordedById: userId },
        { variant: { productId: { in: productIds } } },
      ],
    },
  });
  await prisma.chequeEvent.deleteMany({ where: { cheque: { companyId } } });
  await prisma.cheque.deleteMany({ where: { companyId } });
  await prisma.paymentIntentEvent.deleteMany({
    where: { intent: { companyId } },
  });
  await prisma.paymentIntent.deleteMany({ where: { companyId } });

  const movements = {
    OR: [
      { recordedById: userId },
      { order: { companyId } },
      { transaction: { companyId } },
    ],
  };
  await prisma.cashMovement.deleteMany({
    where: {
      AND: [
        movements,
        {
          OR: [
            { NOT: { reversalOfId: null } },
            { NOT: { counterpartId: null } },
          ],
        },
      ],
    },
  });
  await prisma.cashMovement.deleteMany({ where: movements });
  await prisma.transaction.deleteMany({ where: { companyId } });
  await prisma.invoiceItem.deleteMany({ where: { invoice: { companyId } } });
  await prisma.invoice.deleteMany({ where: { companyId } });
  await prisma.shipmentItem.deleteMany({
    where: { shipment: { order: { companyId } } },
  });
  await prisma.shipment.deleteMany({ where: { order: { companyId } } });
  await prisma.orderStatusHistory.deleteMany({
    where: { order: { companyId } },
  });
  await prisma.orderItem.deleteMany({ where: { order: { companyId } } });
  await prisma.promotionRedemption.deleteMany({ where: { companyId } });
  await prisma.order.deleteMany({ where: { companyId } });
  await prisma.companyDiscount.deleteMany({ where: { companyId } });
  await prisma.address.deleteMany({ where: { companyId } });

  await prisma.user.updateMany({
    where: { companyId },
    data: { companyId: null },
  });
  await prisma.company.updateMany({
    where: { salesRepId: userId },
    data: { salesRepId: null },
  });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.user.deleteMany({ where: { id: userId } });

  await prisma.price.deleteMany({
    where: { variant: { productId: { in: productIds } } },
  });
  await prisma.productVariant.deleteMany({
    where: { productId: { in: productIds } },
  });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.category.deleteMany({
    where: { id: { in: categories.map((c) => c.id) } },
  });
  await prisma.customerGroup.deleteMany({
    where: { id: { in: groups.map((g) => g.id) } },
  });

  if (orphanRows) {
    await prisma.price.deleteMany({
      where: { variant: { productId: { in: orphanRows.productIds } } },
    });
    await prisma.stockMovement.deleteMany({
      where: { variant: { productId: { in: orphanRows.productIds } } },
    });
    await prisma.productVariant.deleteMany({
      where: { productId: { in: orphanRows.productIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: orphanRows.productIds } },
    });
    await prisma.category.deleteMany({
      where: { id: { in: orphanRows.categoryIds } },
    });
    await prisma.customerGroup.deleteMany({
      where: { id: { in: orphanRows.groupIds } },
    });
  }

  console.log(`\n✓ ${total} artık satır silindi.`);
  await prisma.$disconnect();
}

interface OrphanRow {
  kind: "kategori" | "ürün" | "grup";
  name: string;
}

/**
 * İkinci imza: ad kalıbına uyan ve **hiç satılmamış** katalog satırları.
 *
 * Satış şartı önemli: gerçek bir kataloğun ürünü er geç bir sipariş satırında
 * görünür, fixture'ınki teardown'dan sonra hiçbir yerde görünmez.
 */
async function findOrphans(tags: string[]): Promise<{
  list: OrphanRow[];
  productIds: string[];
  categoryIds: string[];
  groupIds: string[];
}> {
  const byPrefix = ORPHAN_PREFIXES.map((p) => ({ name: { startsWith: p } }));

  const products = await prisma.product.findMany({
    where: {
      OR: byPrefix,
      variants: { none: { orderItems: { some: {} } } },
    },
    select: { id: true, name: true, categoryId: true },
  });

  // Kategori yalnızca içi boşaldıysa gidiyor: silinecek ürünlerin dışında bir
  // ürünü kalan kategoriye dokunulmuyor.
  const candidateCategories = await prisma.category.findMany({
    where: { OR: byPrefix },
    select: { id: true, name: true, products: { select: { id: true } } },
  });
  const doomed = new Set(products.map((p) => p.id));
  const categories = candidateCategories.filter((c) =>
    c.products.every((p) => doomed.has(p.id)),
  );

  // Grup fiyat satırına bağlı olabiliyor; bağlıysa bırakılıyor.
  const groups = await prisma.customerGroup.findMany({
    where: {
      OR: byPrefix,
      companies: { none: {} },
      prices: { none: {} },
    },
    select: { id: true, name: true },
  });

  const list: OrphanRow[] = [
    ...categories.map((c) => ({ kind: "kategori" as const, name: c.name })),
    ...products.map((p) => ({ kind: "ürün" as const, name: p.name })),
    ...groups.map((g) => ({ kind: "grup" as const, name: g.name })),
  ];

  // Etiketle zaten yakalananlar iki kez sayılmasın.
  void tags;

  return {
    list,
    productIds: products.map((p) => p.id),
    categoryIds: categories.map((c) => c.id),
    groupIds: groups.map((g) => g.id),
  };
}

void main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
