import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("Password123!", 10);

  // ── Super admin ──
  const admin = await prisma.user.upsert({
    where: { email: "admin@b2b.local" },
    update: {},
    create: {
      email: "admin@b2b.local",
      name: "Super Admin",
      passwordHash: password,
      role: Role.SUPER_ADMIN,
    },
  });

  // ── Sales rep (plasiyer) ──
  const rep = await prisma.user.upsert({
    where: { email: "rep@b2b.local" },
    update: {},
    create: {
      email: "rep@b2b.local",
      name: "Plasiyer Ali",
      passwordHash: password,
      role: Role.SALES_REP,
    },
  });

  // ── Customer group ──
  const group = await prisma.customerGroup.upsert({
    where: { name: "Bayi" },
    update: {},
    create: { name: "Bayi", description: "Standart bayi grubu" },
  });

  // ── Company (cari) ──
  // Upsert, not create: the rest of the seed is idempotent, and re-running it to
  // pick up new fixtures must not duplicate the company or reset its balance.
  const company = await prisma.company.upsert({
    where: { taxNumber: "1234567890" },
    update: {},
    create: {
      name: "Örnek Ticaret A.Ş.",
      taxNumber: "1234567890",
      taxOffice: "Kadıköy",
      creditLimit: 50000,
      requiresOrderApproval: true,
      customerGroupId: group.id,
      salesRepId: rep.id,
      addresses: {
        create: {
          label: "Merkez",
          line1: "Bağdat Cad. No:1",
          city: "İstanbul",
          district: "Kadıköy",
          isDefault: true,
        },
      },
    },
  });

  // ── Company admin + staff ──
  await prisma.user.upsert({
    where: { email: "manager@ornek.local" },
    update: {},
    create: {
      email: "manager@ornek.local",
      name: "Firma Yöneticisi",
      passwordHash: password,
      role: Role.COMPANY_ADMIN,
      companyId: company.id,
    },
  });
  await prisma.user.upsert({
    where: { email: "staff@ornek.local" },
    update: {},
    create: {
      email: "staff@ornek.local",
      name: "Satın Almacı",
      passwordHash: password,
      role: Role.COMPANY_STAFF,
      companyId: company.id,
    },
  });

  // ── Category → Product → Variant → Price ──
  const category = await prisma.category.upsert({
    where: { slug: "ambalaj" },
    update: {},
    create: { name: "Ambalaj", slug: "ambalaj" },
  });

  const product = await prisma.product.upsert({
    where: { slug: "karton-kutu" },
    update: {},
    create: {
      name: "Karton Kutu",
      slug: "karton-kutu",
      description: "Dayanıklı taşıma kutusu",
      vatRate: 20,
      categoryId: category.id,
      variants: {
        create: [
          {
            sku: "KK-30x20-KAHVE",
            barcode: "8690000000011",
            color: "Kahverengi",
            size: "30x20",
            unitsPerCase: 25,
            moqUnits: 25,
            stock: 1000,
          },
        ],
      },
    },
    include: { variants: true },
  });

  const variant = product.variants[0];
  if (variant) {
    // Default list price (customerGroupId null) + group price with a quantity tier.
    await prisma.price.createMany({
      data: [
        { variantId: variant.id, minQuantity: 1, price: 12.5 }, // list price
        { variantId: variant.id, customerGroupId: group.id, minQuantity: 1, price: 10.0 },
        { variantId: variant.id, customerGroupId: group.id, minQuantity: 500, price: 9.0 },
      ],
      skipDuplicates: true,
    });
  }

  await seedReports(admin.id);
  await seedPromotions(group.id);
  await seedDocumentSeries();
  await seedAnnouncements();

  console.log("Seed done. Admin:", admin.email, "/ Password123!");
}

/**
 * Without a serial there is nothing to number a waybill or an invoice with, so
 * a fresh install would be unable to despatch. One default each, both internal.
 */
async function seedDocumentSeries() {
  for (const s of [
    { type: "WAYBILL" as const, prefix: "IRS" },
    { type: "INVOICE" as const, prefix: "FTR" },
  ]) {
    const existing = await prisma.documentSeries.findFirst({
      where: { type: s.type, prefix: s.prefix },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.documentSeries.create({
      data: { type: s.type, prefix: s.prefix, padding: 6, isDefault: true },
    });
  }
}

/**
 * Two starter campaigns — one automatic, one coupon — so the engine has
 * something to chew on right after a fresh install. They use nothing the admin
 * screen cannot also produce: a campaign is just conditions + actions.
 */
async function seedPromotions(customerGroupId: string) {
  const promotions = [
    {
      name: "10.000 ₺ üzeri %5",
      description: "Bayi grubunda 10.000 ₺ ve üzeri sepetlere otomatik %5.",
      code: null,
      priority: 10,
      conditions: [
        { type: "MIN_ORDER_SUBTOTAL", params: { amount: 10000 } },
        { type: "CUSTOMER_GROUP_IN", params: { customerGroupIds: [customerGroupId] } },
      ],
      actions: [{ type: "PERCENT_OFF", params: { percent: 5 } }],
    },
    {
      name: "İlk sipariş kuponu",
      description: "Firmanın ilk siparişinde 250 ₺ indirim; firma başına bir kez.",
      code: "ILKSIPARIS",
      priority: 20,
      perCompanyLimit: 1,
      conditions: [
        { type: "FIRST_ORDER", params: {} },
        { type: "MIN_ORDER_SUBTOTAL", params: { amount: 1000 } },
      ],
      actions: [{ type: "FIXED_OFF_ORDER", params: { amount: 250 } }],
    },
  ];

  for (const p of promotions) {
    const existing = await prisma.promotion.findFirst({
      where: { name: p.name },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.promotion.create({
      data: {
        name: p.name,
        description: p.description,
        code: p.code,
        priority: p.priority,
        perCompanyLimit: p.perCompanyLimit ?? null,
        conditions: p.conditions,
        actions: p.actions,
      },
    });
  }
}

/**
 * Starter report definitions, owned by the admin and shared.
 *
 * They are ordinary definitions — nothing about them is privileged — so they
 * double as worked examples of what the designer can express. Anyone who opens
 * one sees it through their own row scope.
 */
async function seedReports(ownerId: string) {
  const reports = [
    {
      name: "Aylık ciro",
      description: "Onaylanmış siparişlerin aya göre toplamı",
      dataset: "ORDERS" as const,
      config: {
        columns: [
          { field: "createdAt_month", label: "Ay" },
          { field: "grandTotal", aggregate: "SUM", format: "money" },
          { field: "orderNumber", aggregate: "COUNT", label: "Sipariş adedi" },
        ],
        filters: [
          {
            field: "status",
            operator: "in",
            value: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"],
          },
        ],
        groupBy: ["createdAt_month"],
        sort: [{ field: "createdAt_month", direction: "desc" }],
        chart: {
          type: "bar",
          categoryField: "createdAt_month",
          valueField: "grandTotal__sum",
        },
      },
    },
    {
      name: "En çok satan ürünler",
      description: "Son 90 günde adet ve ciro bazında ürün sıralaması",
      dataset: "ORDER_ITEMS" as const,
      config: {
        columns: [
          { field: "productName", label: "Ürün" },
          { field: "quantity", aggregate: "SUM", label: "Adet", format: "number" },
          { field: "lineTotal", aggregate: "SUM", label: "Ciro", format: "money" },
        ],
        filters: [
          { field: "order_createdAt", operator: "lastNDays", value: 90 },
          {
            field: "orderStatus",
            operator: "in",
            value: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"],
          },
        ],
        groupBy: ["productName"],
        sort: [{ field: "lineTotal__sum", direction: "desc" }],
        limit: 25,
      },
    },
    {
      name: "Firma bakiyeleri",
      description: "Aktif firmaların limit ve bakiye dökümü",
      dataset: "COMPANIES" as const,
      config: {
        columns: [
          { field: "name" },
          { field: "salesRepName" },
          { field: "creditLimit" },
          { field: "currentBalance" },
          { field: "paymentTermDays" },
        ],
        filters: [{ field: "isActive", operator: "eq", value: true }],
        groupBy: [],
        sort: [{ field: "currentBalance", direction: "desc" }],
      },
    },
    {
      name: "Plasiyere göre tahsilat",
      description: "Son 30 günde kaydeden kişiye göre tahsilat toplamı",
      dataset: "LEDGER" as const,
      config: {
        columns: [
          { field: "recordedByName", label: "Kaydeden" },
          { field: "amount", aggregate: "SUM", label: "Tahsilat", format: "money" },
          { field: "amount", aggregate: "COUNT", label: "Kayıt" },
        ],
        filters: [
          { field: "type", operator: "eq", value: "CREDIT" },
          { field: "createdAt", operator: "lastNDays", value: 30 },
        ],
        groupBy: ["recordedByName"],
        sort: [{ field: "amount__sum", direction: "desc" }],
        chart: {
          type: "pie",
          categoryField: "recordedByName",
          valueField: "amount__sum",
        },
      },
    },
  ];

  for (const r of reports) {
    const existing = await prisma.reportDefinition.findFirst({
      where: { name: r.name, ownerId },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.reportDefinition.create({
      data: {
        name: r.name,
        description: r.description,
        dataset: r.dataset,
        ownerId,
        isShared: true,
        config: r.config,
      },
    });
  }
}

/**
 * Vitrin duyuruları — üç konumun da nasıl göründüğünü gösterecek kadar.
 * Duyurular hiçbir tutarı etkilemez; indirimin kendisi seedPromotions'ta.
 */
async function seedAnnouncements() {
  const items = [
    {
      title: "Kasım kampanyası başladı",
      body: "Seçili kategorilerde %25'e varan indirim. KUPON25 koduyla sepette geçerli.",
      placement: "BANNER" as const,
      tone: "brand",
      priority: 100,
      linkUrl: "/portal",
      linkLabel: "Katalogu gör",
    },
    {
      title: "Ücretsiz kargo",
      body: "5.000 TL üzeri siparişlerde",
      placement: "TICKER" as const,
      tone: "info",
      priority: 50,
      linkUrl: null,
      linkLabel: null,
    },
    {
      title: "Yeni sezon ürünleri stokta",
      body: null,
      placement: "TICKER" as const,
      tone: "success",
      priority: 40,
      linkUrl: null,
      linkLabel: null,
    },
  ];

  for (const a of items) {
    const existing = await prisma.announcement.findFirst({
      where: { title: a.title },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.announcement.create({ data: a });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
