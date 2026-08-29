/* eslint-disable no-console */
import { prisma } from "@repo/database";
import type {
  CreateReportDefinitionInput,
  DashboardTile,
} from "@repo/types";
import { createReportDefinition, updateReportDefinition } from "./report-definition";
import { createDashboard, updateDashboard } from "./report-dashboard";
import { findReportTemplate } from "./report-templates";
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

// Gösterimde kullanılan dört tanım **hazır şablon kataloğundan** geliyor
// (`report-templates.ts`). Eskiden burada ayrı ayrı yazılıydılar ve aynı dört
// rapor iki dosyada duruyordu: biri düzeltilince diğeri sessizce eskiyordu.
// Katalog zaten test ediliyor, gösterim de ondan besleniyor.
const DEMO_TEMPLATE_KEYS = [
  "aylik-ciro",
  "firma-ciro",
  "kategori-kirilimi",
  "plasiyer-ciro-90",
] as const;

/** Gösterim tanımları **paylaşık**: diğer gösterim hesapları da görsün. */
const DEFINITIONS: CreateReportDefinitionInput[] = DEMO_TEMPLATE_KEYS.map((key) => {
  const template = findReportTemplate(key);
  if (!template) throw new Error(`Gösterim şablonu yok: ${key}`);
  return {
    name: template.name,
    description: template.description,
    dataset: template.dataset,
    isShared: true,
    config: template.config,
  };
});

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
