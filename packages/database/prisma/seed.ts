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
  const company = await prisma.company.create({
    data: {
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

  console.log("Seed done. Admin:", admin.email, "/ Password123!");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
