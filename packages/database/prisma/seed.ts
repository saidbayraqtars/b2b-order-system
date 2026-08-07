import { PrismaClient, Role } from "@prisma/client";
import { DEFAULT_LABEL_TEMPLATES, defaultPermissionsFor } from "@repo/types";
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
      permissions: defaultPermissionsFor("SUPER_ADMIN"),
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
      permissions: defaultPermissionsFor("SALES_REP"),
    },
  });

  // ── Customer group ──
  const group = await prisma.customerGroup.upsert({
    where: { name: "Bayi" },
    update: {},
    create: { name: "Bayi", description: "Standart bayi grubu" },
  });

  // ── Vade tanımları ──
  // Global definitions; which customer may pick which is the m-n below.
  const terms = await Promise.all(
    [
      { name: "Peşin", days: 0 },
      { name: "30 gün", days: 30 },
      { name: "60 gün", days: 60 },
    ].map((t) =>
      prisma.paymentTerm.upsert({
        where: { name: t.name },
        update: {},
        create: { ...t, sortOrder: t.days },
      }),
    ),
  );

  // ── Hacim iskontosu merdiveni ──
  // The same offer to everyone; each company earns the best rung its own
  // turnover reaches. Seeded with a yearly ladder plus one short-window rung,
  // because "best rate wins" is only really exercised when the windows differ.
  const tiers = await Promise.all(
    [
      { name: "Bronz", minRevenue: 100_000, windowMonths: 12, discountPercent: 1.5 },
      { name: "Gümüş", minRevenue: 300_000, windowMonths: 12, discountPercent: 3 },
      { name: "Altın", minRevenue: 750_000, windowMonths: 12, discountPercent: 5 },
      { name: "Çeyrek Atağı", minRevenue: 120_000, windowMonths: 3, discountPercent: 4 },
    ].map((t) =>
      prisma.volumeTier.upsert({
        where: { name: t.name },
        // Refreshed on re-run, like the vade menu: `update: {}` would leave an
        // already-seeded database describing thresholds it does not have.
        update: {
          minRevenue: t.minRevenue,
          windowMonths: t.windowMonths,
          discountPercent: t.discountPercent,
          isActive: true,
        },
        create: { ...t, sortOrder: Math.round(t.minRevenue / 1000) },
      }),
    ),
  );

  // ── Company (cari) ──
  // Upsert, not create: the rest of the seed is idempotent, and re-running it to
  // pick up new fixtures must not duplicate the company or reset its balance.
  const company = await prisma.company.upsert({
    where: { taxNumber: "1234567890" },
    // Settlement config is refreshed on re-run, unlike balance and history:
    // `update: {}` would leave an already-seeded database without the vade
    // menu, so the fixture would silently describe something that isn't there.
    update: {
      paymentTerms: { set: terms.map((t) => ({ id: t.id })) },
      allowedPaymentMethods: [],
    },
    create: {
      name: "Örnek Ticaret A.Ş.",
      taxNumber: "1234567890",
      taxOffice: "Kadıköy",
      creditLimit: 50000,
      requiresOrderApproval: true,
      customerGroupId: group.id,
      salesRepId: rep.id,
      // Full vade menu, no method restriction — the common case.
      paymentTerms: { connect: terms.map((t) => ({ id: t.id })) },
      addresses: {
        create: {
          label: "Merkez",
          line1: "Bağdat Cad. No:1",
          city: "İstanbul",
          district: "Kadıköy",
          // Ziyaret haritasının ve yol tarifinin okuduğu nokta.
          latitude: 40.9903,
          longitude: 29.0275,
          isDefault: true,
        },
      },
    },
  });

  // İkinci firma — bilerek **hiçbir plasiyere atanmamış**. Portföy izolasyonu
  // ancak portföy dışında bir firma varsa sınanabilir: plasiyer bunu
  // görmemeli, adına sipariş girememeli.
  await prisma.company.upsert({
    where: { taxNumber: "9876543210" },
    update: {
      allowedPaymentMethods: ["CASH", "BANK_TRANSFER"],
      volumeDiscountMode: "MANUAL",
      volumeTierId: tiers.find((t) => t.name === "Gümüş")?.id ?? null,
    },
    create: {
      name: "Beta Dağıtım Ltd.",
      taxNumber: "9876543210",
      taxOffice: "Çankaya",
      creditLimit: 25000,
      customerGroupId: group.id,
      // Deliberately restricted, and to a prepaid method: this is the fixture
      // that proves the restriction bites (açık hesap must be refused here) and
      // that a vade cannot be attached to a cash sale.
      allowedPaymentMethods: ["CASH", "BANK_TRANSFER"],
      // Pinned rather than earned: this is the fixture for a rate promised in a
      // contract. It must price at %3 with zero turnover, and it must keep
      // pricing at %3 if "Gümüş" is later retired from the ladder.
      volumeDiscountMode: "MANUAL",
      volumeTierId: tiers.find((t) => t.name === "Gümüş")?.id ?? null,
      addresses: {
        create: {
          label: "Merkez",
          line1: "Atatürk Bul. No:42",
          city: "Ankara",
          district: "Çankaya",
          latitude: 39.9208,
          longitude: 32.8541,
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
      permissions: defaultPermissionsFor("COMPANY_ADMIN"),
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
      permissions: defaultPermissionsFor("COMPANY_STAFF"),
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
  await seedLabelTemplates();

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
 * Hazır etiket ve fiş tasarımları.
 *
 * Basım motoru bunlar olmadan da çalışıyor (kod içindeki hazır tasarıma
 * düşüyor), ama veritabanına yazmak tasarımcının düzenleyebileceği bir
 * başlangıç noktası veriyor — kullanıcı sıfırdan satır dizmek zorunda kalmıyor.
 * Aynı türde bir şablon zaten varsa dokunulmaz: kurulum sonrası yapılan
 * düzenleme her seed çalıştırmasında geri alınmamalı.
 */
async function seedLabelTemplates() {
  for (const t of DEFAULT_LABEL_TEMPLATES) {
    const existing = await prisma.labelTemplate.findFirst({
      where: { kind: t.kind },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.labelTemplate.create({
      data: {
        kind: t.kind,
        name: t.name,
        widthMm: t.widthMm,
        heightMm: t.heightMm ?? null,
        blocks: t.blocks,
        isDefault: true,
      },
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
