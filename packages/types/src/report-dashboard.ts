import { z } from "zod";
import { entityIdSchema } from "./id";

// A dashboard is an ordered list of tiles, and a tile is a pointer to a saved
// report plus how wide to draw it. Nothing about the report itself is copied
// here: whether the report still exists, and whether the viewer may open it, is
// decided when the board is run — see report-dashboard.ts in @repo/services.

export const TileWidthEnum = z.enum(["half", "full"]);
export type TileWidth = z.infer<typeof TileWidthEnum>;

export const TILE_WIDTH_LABELS: Record<TileWidth, string> = {
  half: "Yarım genişlik",
  full: "Tam genişlik",
};

export const dashboardTileSchema = z.object({
  // cuid() değil — bkz. id.ts.
  definitionId: entityIdSchema,
  width: TileWidthEnum.default("half"),
  /** Overrides the report's own name on this board only. */
  title: z.string().max(120).optional(),
});
export type DashboardTile = z.infer<typeof dashboardTileSchema>;

const dashboardBodySchema = z.object({
  name: z.string().min(1, "Pano adı gerekli").max(120),
  description: z.string().max(500).nullable().optional(),
  isShared: z.boolean().optional(),
  /**
   * The cap is not a technical limit: every tile is a query, and a board that
   * runs more than a dozen of them is a page nobody waits for.
   */
  tiles: z.array(dashboardTileSchema).max(12).default([]),
});

export const createDashboardSchema = dashboardBodySchema;
export type CreateDashboardInput = z.infer<typeof createDashboardSchema>;

export const updateDashboardSchema = dashboardBodySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Güncellenecek alan yok");
export type UpdateDashboardInput = z.infer<typeof updateDashboardSchema>;
