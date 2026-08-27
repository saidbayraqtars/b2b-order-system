/* eslint-disable no-console */
import { prisma } from "@repo/database";
import type {
  CreateReportDefinitionInput,
  DashboardTile,
} from "@repo/types";
import { createReportDefinition, updateReportDefinition } from "./report-definition";
import { createDashboard, updateDashboard } from "./report-dashboard";
import type { ReportContext } from "./report-registry";

// Gösterim rapor tanımları ve bir pano.
//
// Ayrı dosyada duruyor çünkü ayrı bir şey: `demo-seed` firma, sipariş ve
// tahsilat üretiyor — *veri*. Burada üretilen şey **tasarım**: hangi sütunun
// hangi sıraya dizildiği. İkisi birbirinden bağımsız ve bu yüzden bu adım
// gösterim verisi zaten yüklüyken de çalışabiliyor; hepsi ada göre upsert.
//
// Neden gerekiyor: rapor ekranlarının doğru göründüğünü ancak içi doluyken
// söyleyebiliyoruz. Tanımsız bir kurulumda `/reports`, `/reports/[id]`,
// `/reports/dashboards` ve yazdırma yüzeyi dört boş kutu olarak
// fotoğraflanıyordu — dördü de ekranın kendisi hakkında hiçbir şey söylemiyor.

/** Ciro tanımı her yerde aynı: iptal ve red sayılmaz. */
const LIVE_ORDERS = {
  field: "status",
  operator: "notIn" as const,
  value: ["CANCELLED", "REJECTED"],
};

const DEFINITIONS: CreateReportDefinitionInput[] = [
  {
    name: "Aylık ciro",
    description: "Ay ay net ciro ve sipariş adedi",
    dataset: "ORDERS",
    isShared: true,
    config: {
      columns: [
        { field: "createdAt_month", label: "Ay" },
        { field: "grandTotal", aggregate: "SUM", label: "Ciro", format: "money" },
        { field: "orderNumber", aggregate: "COUNT", label: "Sipariş", format: "number" },
      ],
      computed: [],
      filters: [LIVE_ORDERS],
      groupBy: ["createdAt_month"],
      sort: [{ field: "createdAt_month", direction: "asc" }],
      chart: {
        type: "bar",
        categoryField: "createdAt_month",
        valueField: "grandTotal__sum",
      },
    },
  },
  {
    name: "Firma bazında ciro",
    description: "En çok alan 20 firma, ortalama sepetiyle",
    dataset: "ORDERS",
    isShared: true,
    config: {
      columns: [
        { field: "companyName", label: "Firma", width: 240 },
        { field: "grandTotal", aggregate: "SUM", label: "Ciro", format: "money" },
        { field: "orderNumber", aggregate: "COUNT", label: "Sipariş", format: "number" },
      ],
      // Hesaplanmış sütun sorguya gitmiyor, sonucun üstünde çalışıyor: bölme
      // SQL'de yapılsaydı gruplama başına bir kez değil satır başına bir kez
      // yapılırdı ve ortalama, ortalamaların ortalaması olurdu.
      computed: [
        {
          key: "ortalamaSepet",
          label: "Ortalama sepet",
          expression: "grandTotal__sum / orderNumber__count",
          format: "money",
        },
      ],
      filters: [LIVE_ORDERS],
      groupBy: ["companyName"],
      sort: [{ field: "grandTotal__sum", direction: "desc" }],
      limit: 20,
      chart: { type: "table" },
    },
  },
  {
    name: "Kategori kırılımı",
    description: "Satılan malın kategorilere dağılımı",
    dataset: "ORDER_ITEMS",
    isShared: true,
    config: {
      columns: [
        { field: "categoryName", label: "Kategori" },
        { field: "lineTotal", aggregate: "SUM", label: "Tutar", format: "money" },
        { field: "quantity", aggregate: "SUM", label: "Adet", format: "number" },
      ],
      computed: [],
      filters: [],
      groupBy: ["categoryName"],
      sort: [{ field: "lineTotal__sum", direction: "desc" }],
      limit: 10,
      chart: {
        type: "pie",
        categoryField: "categoryName",
        valueField: "lineTotal__sum",
      },
    },
  },
  {
    name: "Plasiyer cirosu (90 gün)",
    description: "Son 90 günün cirosu, portföy sahibine göre",
    dataset: "ORDERS",
    isShared: true,
    config: {
      columns: [
        { field: "salesRepName", label: "Plasiyer" },
        { field: "grandTotal", aggregate: "SUM", label: "Ciro", format: "money" },
        { field: "orderNumber", aggregate: "COUNT", label: "Sipariş", format: "number" },
      ],
      computed: [],
      // Kayan pencere: kaydedilen rapor tarih donduğu anda bayatlar.
      filters: [LIVE_ORDERS, { field: "createdAt", operator: "lastNDays", value: 90 }],
      groupBy: ["salesRepName"],
      sort: [{ field: "grandTotal__sum", direction: "desc" }],
      chart: {
        type: "bar",
        categoryField: "salesRepName",
        valueField: "grandTotal__sum",
      },
    },
  },
];

const DASHBOARD_NAME = "Yönetim özeti";

/** Ada göre upsert — ikinci kez çalıştırmak kopya üretmiyor. */
async function upsertDefinition(
  input: CreateReportDefinitionInput,
  ctx: ReportContext,
): Promise<string> {
  const existing = await prisma.reportDefinition.findFirst({
    where: { name: input.name, ownerId: ctx.userId },
    select: { id: true },
  });
  if (existing) {
    await updateReportDefinition(
      existing.id,
      {
        name: input.name,
        description: input.description ?? null,
        isShared: input.isShared,
        config: input.config,
      },
      ctx,
    );
    return existing.id;
  }
  const created = await createReportDefinition(input, ctx);
  return created.id;
}

export async function seedDemoReports(adminId: string): Promise<void> {
  const ctx: ReportContext = {
    userId: adminId,
    role: "SUPER_ADMIN",
    companyId: null,
  };

  const ids: string[] = [];
  for (const definition of DEFINITIONS) {
    ids.push(await upsertDefinition(definition, ctx));
  }

  // Pano: iki geniş grafik altta yan yana iki tablo. Genişlik kartın kendi
  // özelliği, panonun değil — grafik tam satır ister, liste yarım satırda
  // okunur.
  const tiles: DashboardTile[] = [
    { definitionId: ids[0]!, width: "full", title: "Aylık ciro" },
    { definitionId: ids[3]!, width: "half", title: "Plasiyer cirosu" },
    { definitionId: ids[2]!, width: "half", title: "Kategori kırılımı" },
    { definitionId: ids[1]!, width: "full", title: "En çok alan firmalar" },
  ];

  const board = await prisma.reportDashboard.findFirst({
    where: { name: DASHBOARD_NAME, ownerId: adminId },
    select: { id: true },
  });
  if (board) {
    await updateDashboard(board.id, { name: DASHBOARD_NAME, tiles }, ctx);
  } else {
    await createDashboard(
      {
        name: DASHBOARD_NAME,
        description: "Ciro, plasiyer ve kategori tek ekranda",
        isShared: true,
        tiles,
      },
      ctx,
    );
  }

  console.log(`✓ ${ids.length} gösterim raporu + 1 pano (“${DASHBOARD_NAME}”).`);
}

/**
 * Doğrudan çalıştırıldığında kendi kendine yeter:
 * `pnpm --filter @repo/services demo:reports`.
 *
 * Gösterim verisini yeniden tohumlamıyor — yalnızca tanımları yazıyor, çünkü
 * yeniden tohumlama bütün gösterim kimliklerini (`cuid`) değiştiriyor.
 */
if (process.argv[1]?.replace(/\\/g, "/").endsWith("demo-reports.ts")) {
  void (async () => {
    const admin = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!admin) {
      console.error("HATA: süper admin yok. Önce db:bootstrap.");
      process.exit(1);
    }
    await seedDemoReports(admin.id);
    await prisma.$disconnect();
  })();
}
