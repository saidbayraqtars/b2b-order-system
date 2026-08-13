import { Prisma, prisma } from "@repo/database";
import {
  dashboardTileSchema,
  type CreateDashboardInput,
  type DashboardTile,
  type UpdateDashboardInput,
} from "@repo/types";
import { BusinessError } from "./errors";
import { runReportDefinition } from "./report-definition";
import type { ReportRunResult } from "./report-engine";
import type { ReportContext } from "./report-registry";

/**
 * Dashboards: several saved reports on one screen.
 *
 * A board holds pointers, not copies. Editing a report changes it everywhere it
 * appears, which is the only behaviour that does not slowly drift into "the
 * number on the board disagrees with the number in the report".
 *
 * Every tile is run through `runReportDefinition`, so each one goes through the
 * same ownership check and the same row scope as opening that report on its
 * own. Putting an admin's report on a shared board therefore does not hand it
 * to anyone: a rep opening the board sees their own portfolio in it, and a tile
 * pointing at a report they may not open comes back as a broken tile.
 */

export interface DashboardSummary {
  id: string;
  name: string;
  description: string | null;
  isShared: boolean;
  ownerId: string;
  ownerName: string;
  isOwn: boolean;
  canEdit: boolean;
  tileCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardDetail extends DashboardSummary {
  tiles: DashboardTile[];
}

/** One tile's outcome: either a result or the reason there is none. */
export interface DashboardTileResult {
  definitionId: string;
  width: DashboardTile["width"];
  title: string;
  result: ReportRunResult | null;
  error: string | null;
}

export interface DashboardRunResult {
  id: string;
  name: string;
  description: string | null;
  isShared: boolean;
  /**
   * Carried on the run so that opening a board is one request. The alternative
   * — asking the detail endpoint whether the buttons should be there — would
   * make a viewer who may run reports but not build them fetch something they
   * are not allowed to have.
   */
  canEdit: boolean;
  tiles: DashboardTileResult[];
  generatedAt: string;
}

function canEdit(ctx: ReportContext, ownerId: string): boolean {
  return ctx.role === "SUPER_ADMIN" || ownerId === ctx.userId;
}

/**
 * Read the stored tiles.
 *
 * Forgiving on the way out, strict on the way in: a tile that no longer parses
 * is dropped rather than throwing, because a board that cannot be opened cannot
 * be repaired either.
 */
function parseTiles(raw: Prisma.JsonValue): DashboardTile[] {
  if (!Array.isArray(raw)) return [];
  const out: DashboardTile[] = [];
  for (const item of raw) {
    const parsed = dashboardTileSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function asJson(tiles: DashboardTile[]): Prisma.InputJsonValue {
  return tiles as unknown as Prisma.InputJsonValue;
}

const SELECT = {
  id: true,
  name: true,
  description: true,
  isShared: true,
  ownerId: true,
  owner: { select: { name: true } },
  tiles: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = Prisma.ReportDashboardGetPayload<{ select: typeof SELECT }>;

function toSummary(row: Row, ctx: ReportContext): DashboardSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isShared: row.isShared,
    ownerId: row.ownerId,
    ownerName: row.owner.name,
    isOwn: row.ownerId === ctx.userId,
    canEdit: canEdit(ctx, row.ownerId),
    tileCount: parseTiles(row.tiles).length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDashboards(
  ctx: ReportContext,
): Promise<DashboardSummary[]> {
  const rows = await prisma.reportDashboard.findMany({
    where: { OR: [{ ownerId: ctx.userId }, { isShared: true }] },
    select: SELECT,
    orderBy: [{ name: "asc" }],
  });
  return rows.map((r) => toSummary(r, ctx));
}

async function load(id: string, ctx: ReportContext): Promise<Row> {
  const row = await prisma.reportDashboard.findUnique({
    where: { id },
    select: SELECT,
  });
  if (!row) {
    throw new BusinessError("DASHBOARD_NOT_FOUND", "Pano bulunamadı", { id });
  }
  if (row.ownerId !== ctx.userId && !row.isShared && ctx.role !== "SUPER_ADMIN") {
    throw new BusinessError("FORBIDDEN", "Bu panoya erişiminiz yok");
  }
  return row;
}

export async function getDashboard(
  id: string,
  ctx: ReportContext,
): Promise<DashboardDetail> {
  const row = await load(id, ctx);
  return { ...toSummary(row, ctx), tiles: parseTiles(row.tiles) };
}

/**
 * Tiles are checked against the reports the caller can actually see.
 *
 * Pointing a tile at a report you cannot open would not leak anything — the run
 * refuses it too — but it would leave the author with a board full of tiles
 * that never work and no explanation.
 */
async function assertTilesVisible(
  tiles: DashboardTile[],
  ctx: ReportContext,
): Promise<void> {
  if (tiles.length === 0) return;
  const ids = [...new Set(tiles.map((t) => t.definitionId))];
  const visible = await prisma.reportDefinition.findMany({
    where: {
      id: { in: ids },
      ...(ctx.role === "SUPER_ADMIN"
        ? {}
        : { OR: [{ ownerId: ctx.userId }, { isShared: true }] }),
    },
    select: { id: true },
  });
  const found = new Set(visible.map((v) => v.id));
  const missing = ids.find((id) => !found.has(id));
  if (missing) {
    throw new BusinessError(
      "REPORT_NOT_FOUND",
      "Panoya eklenen raporlardan biri bulunamadı",
      { definitionId: missing },
    );
  }
}

export async function createDashboard(
  input: CreateDashboardInput,
  ctx: ReportContext,
): Promise<{ id: string }> {
  await assertTilesVisible(input.tiles, ctx);
  return prisma.reportDashboard.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      isShared: input.isShared ?? false,
      ownerId: ctx.userId,
      tiles: asJson(input.tiles),
    },
    select: { id: true },
  });
}

export async function updateDashboard(
  id: string,
  input: UpdateDashboardInput,
  ctx: ReportContext,
): Promise<{ id: string }> {
  const row = await load(id, ctx);
  if (!canEdit(ctx, row.ownerId)) {
    throw new BusinessError("FORBIDDEN", "Bu panoyu düzenleme yetkiniz yok");
  }
  if (input.tiles) await assertTilesVisible(input.tiles, ctx);

  return prisma.reportDashboard.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.isShared !== undefined ? { isShared: input.isShared } : {}),
      ...(input.tiles !== undefined ? { tiles: asJson(input.tiles) } : {}),
    },
    select: { id: true },
  });
}

export async function deleteDashboard(
  id: string,
  ctx: ReportContext,
): Promise<void> {
  const row = await load(id, ctx);
  if (!canEdit(ctx, row.ownerId)) {
    throw new BusinessError("FORBIDDEN", "Bu panoyu silme yetkiniz yok");
  }
  await prisma.reportDashboard.delete({ where: { id } });
}

/**
 * Run every tile under the caller's own scope.
 *
 * One tile at a time on purpose: a board is a dozen queries, and firing them all
 * at once turns opening a page into a load spike on the same database that is
 * taking orders. A broken tile is reported in place — a deleted report, one the
 * viewer may not open, or a definition that no longer validates must not cost
 * the other eleven tiles their numbers.
 */
export async function runDashboard(
  id: string,
  ctx: ReportContext,
): Promise<DashboardRunResult> {
  const row = await load(id, ctx);
  const tiles = parseTiles(row.tiles);

  const results: DashboardTileResult[] = [];
  for (const tile of tiles) {
    try {
      const result = await runReportDefinition(tile.definitionId, ctx);
      results.push({
        definitionId: tile.definitionId,
        width: tile.width,
        title: tile.title ?? result.definition.name,
        result,
        error: null,
      });
    } catch (err) {
      results.push({
        definitionId: tile.definitionId,
        width: tile.width,
        title: tile.title ?? "Rapor",
        result: null,
        error:
          err instanceof BusinessError
            ? err.message
            : "Rapor çalıştırılamadı",
      });
    }
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isShared: row.isShared,
    canEdit: canEdit(ctx, row.ownerId),
    tiles: results,
    generatedAt: new Date().toISOString(),
  };
}
