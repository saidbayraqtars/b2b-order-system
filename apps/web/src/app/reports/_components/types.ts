import type { Aggregate, ColumnFormat, ReportDataset } from "@repo/types";

// Shape of GET /api/reports/datasets. Mirrors describeDatasets() in
// @repo/services — deliberately without the Prisma path, which the client has
// no business knowing.

export interface CatalogField {
  key: string;
  label: string;
  type: "string" | "number" | "money" | "date" | "enum" | "boolean";
  groupable: boolean;
  aggregates: Aggregate[];
  operators: string[];
  enumValues: string[] | null;
  format: ColumnFormat;
}

export interface CatalogDataset {
  key: ReportDataset;
  label: string;
  defaultSort: { field: string; direction: "asc" | "desc" };
  fields: CatalogField[];
}

export interface DefinitionSummary {
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
