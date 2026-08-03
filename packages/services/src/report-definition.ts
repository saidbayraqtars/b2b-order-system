import { Prisma, prisma } from "@repo/database";
import {
  reportConfigSchema,
  type CreateReportDefinitionInput,
  type ReportConfig,
  type ReportDataset,
  type UpdateReportDefinitionInput,
} from "@repo/types";
import { BusinessError } from "./errors";
import { normalizeConfig, runReport, type ReportRunResult } from "./report-engine";
import type { ReportContext } from "./report-registry";

// CRUD for saved report definitions.
//
// Ownership: you may edit or delete your own; a super admin may touch any.
// Visibility: your own plus anything marked shared. Sharing is safe because the
// engine applies the RUNNER's row scope, not the author's — a rep opening an
// admin's shared report sees it through their own portfolio.

export interface ReportDefinitionSummary {
  id: string;
  name: string;
  description: string | null;
  dataset: ReportDataset;
  isShared: boolean;
  ownerId: string;
  ownerName: string;
  isOwn: boolean;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReportDefinitionDetail extends ReportDefinitionSummary {
  config: ReportConfig;
}

function canEdit(ctx: ReportContext, ownerId: string): boolean {
  return ctx.role === "SUPER_ADMIN" || ownerId === ctx.userId;
}

/**
 * A validated config is JSON by construction — filter values came through Zod
 * and every field name was resolved against the registry — but its `value:
 * unknown` fields keep TypeScript from proving it, hence the cast.
 */
function asJson(config: ReportConfig): Prisma.InputJsonValue {
  return config as unknown as Prisma.InputJsonValue;
}

export async function listReportDefinitions(
  ctx: ReportContext,
): Promise<ReportDefinitionSummary[]> {
  const rows = await prisma.reportDefinition.findMany({
    where: { OR: [{ ownerId: ctx.userId }, { isShared: true }] },
    select: {
      id: true,
      name: true,
      description: true,
      dataset: true,
      isShared: true,
      ownerId: true,
      owner: { select: { name: true } },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ name: "asc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    dataset: r.dataset,
    isShared: r.isShared,
    ownerId: r.ownerId,
    ownerName: r.owner.name,
    isOwn: r.ownerId === ctx.userId,
    canEdit: canEdit(ctx, r.ownerId),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

async function load(id: string, ctx: ReportContext) {
  const row = await prisma.reportDefinition.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      dataset: true,
      isShared: true,
      ownerId: true,
      owner: { select: { name: true } },
      config: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!row) {
    throw new BusinessError("REPORT_NOT_FOUND", "Rapor bulunamadı", { id });
  }
  if (row.ownerId !== ctx.userId && !row.isShared && ctx.role !== "SUPER_ADMIN") {
    throw new BusinessError("FORBIDDEN", "Bu rapora erişiminiz yok");
  }
  return row;
}

/**
 * Parse a stored config. It lives in a Json column, so it gets the same
 * structural check as fresh input before the registry pass — a hand-edited row
 * cannot smuggle a field name past the engine.
 */
function parseStored(raw: unknown, dataset: ReportDataset): ReportConfig {
  const parsed = reportConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BusinessError(
      "INVALID_REPORT",
      "Kayıtlı rapor tanımı okunamadı",
      { issue: parsed.error.issues[0]?.message },
    );
  }
  return normalizeConfig(dataset, parsed.data);
}

export async function getReportDefinition(
  id: string,
  ctx: ReportContext,
): Promise<ReportDefinitionDetail> {
  const row = await load(id, ctx);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    dataset: row.dataset,
    isShared: row.isShared,
    ownerId: row.ownerId,
    ownerName: row.owner.name,
    isOwn: row.ownerId === ctx.userId,
    canEdit: canEdit(ctx, row.ownerId),
    config: parseStored(row.config, row.dataset),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createReportDefinition(
  input: CreateReportDefinitionInput,
  ctx: ReportContext,
): Promise<{ id: string }> {
  const config = normalizeConfig(input.dataset, input.config);

  const row = await prisma.reportDefinition.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      dataset: input.dataset,
      isShared: input.isShared ?? false,
      ownerId: ctx.userId,
      config: asJson(config),
    },
    select: { id: true },
  });
  return row;
}

export async function updateReportDefinition(
  id: string,
  input: UpdateReportDefinitionInput,
  ctx: ReportContext,
): Promise<{ id: string }> {
  const row = await load(id, ctx);
  if (!canEdit(ctx, row.ownerId)) {
    throw new BusinessError("FORBIDDEN", "Bu raporu düzenleme yetkiniz yok");
  }

  const updated = await prisma.reportDefinition.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isShared !== undefined ? { isShared: input.isShared } : {}),
      ...(input.config !== undefined
        ? { config: asJson(normalizeConfig(row.dataset, input.config)) }
        : {}),
    },
    select: { id: true },
  });
  return updated;
}

export async function deleteReportDefinition(
  id: string,
  ctx: ReportContext,
): Promise<void> {
  const row = await load(id, ctx);
  if (!canEdit(ctx, row.ownerId)) {
    throw new BusinessError("FORBIDDEN", "Bu raporu silme yetkiniz yok");
  }
  await prisma.reportDefinition.delete({ where: { id } });
}

/** Run a saved definition under the CALLER's scope, not the author's. */
export async function runReportDefinition(
  id: string,
  ctx: ReportContext,
): Promise<ReportRunResult & { definition: { id: string; name: string } }> {
  const row = await load(id, ctx);
  const config = parseStored(row.config, row.dataset);
  const result = await runReport(row.dataset, config, ctx);
  return { ...result, definition: { id: row.id, name: row.name } };
}
