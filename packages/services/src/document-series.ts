import { Prisma, prisma } from "@repo/database";
import type {
  CreateDocumentSeriesInput,
  DocumentType,
  UpdateDocumentSeriesInput,
} from "@repo/types";
import { BusinessError } from "./errors";

// Document numbering.
//
// A waybill or invoice number has to be unique for the life of the business, has
// to be gapless enough to satisfy an auditor, and — because this system runs
// alongside an ERP — must not collide with numbers the ERP issues. So the serial
// is a row, not a constant: prefix, width and the last number handed out.
//
// Allocation is a single UPDATE ... RETURNING inside the caller's transaction.
// Postgres takes a row lock for the duration, so two despatches racing for the
// next number queue up instead of both reading the same value. A cancelled
// document keeps its number: reusing one would make the sequence lie.

type Client = Prisma.TransactionClient;

export interface DocumentSeriesRow {
  id: string;
  type: DocumentType;
  prefix: string;
  padding: number;
  lastNumber: number;
  isDefault: boolean;
  externalOnly: boolean;
  note: string | null;
  /** What the next allocated number would look like. */
  nextNumber: string;
}

export function formatDocumentNumber(
  prefix: string,
  padding: number,
  n: number,
): string {
  return `${prefix}${String(n).padStart(padding, "0")}`;
}

/**
 * Take the next number for `type`.
 *
 * Returns null when the serial is ERP-owned (`externalOnly`) — the caller must
 * then have been given a number to use, and refuses the document if it wasn't.
 * Throws when no serial is configured at all, because silently inventing a
 * format would be worse than stopping.
 */
export async function allocateDocumentNumber(
  tx: Client,
  type: DocumentType,
): Promise<string | null> {
  const series = await pickSeries(tx, type);

  if (series.externalOnly) return null;

  const updated = await tx.documentSeries.update({
    where: { id: series.id },
    data: { lastNumber: { increment: 1 } },
    select: { prefix: true, padding: true, lastNumber: true },
  });
  return formatDocumentNumber(updated.prefix, updated.padding, updated.lastNumber);
}

async function pickSeries(tx: Client, type: DocumentType) {
  const series =
    (await tx.documentSeries.findFirst({
      where: { type, isDefault: true },
      select: { id: true, externalOnly: true },
    })) ??
    (await tx.documentSeries.findFirst({
      where: { type },
      orderBy: { createdAt: "asc" },
      select: { id: true, externalOnly: true },
    }));

  if (!series) {
    throw new BusinessError(
      "DOCUMENT_SERIES_MISSING",
      type === "WAYBILL"
        ? "İrsaliye serisi tanımlı değil"
        : "Fatura serisi tanımlı değil",
      { type },
    );
  }
  return series;
}

/**
 * Resolve the number a document will carry: the ERP's when the serial is
 * external, ours otherwise. Supplying an external number for an internal serial
 * is allowed and wins — that is how a document entered late in the ERP is
 * reconciled — but it is never invented here.
 */
export async function resolveDocumentNumber(
  tx: Client,
  type: DocumentType,
  externalNumber?: string | null,
): Promise<{ documentNumber: string; externalNumber: string | null }> {
  const external = externalNumber?.trim() || null;
  if (external) {
    // The ERP's number becomes the document number, and our counter is left
    // alone: advancing it here would tear a gap in our own sequence.
    return { documentNumber: external, externalNumber: external };
  }

  const allocated = await allocateDocumentNumber(tx, type);
  if (!allocated) {
    throw new BusinessError(
      "EXTERNAL_NUMBER_REQUIRED",
      "Bu seri ERP tarafından yönetiliyor — belge numarasını girin",
      { type },
    );
  }
  return { documentNumber: allocated, externalNumber: null };
}

// ─────────────────────────────────────────────
// ADMINISTRATION
// ─────────────────────────────────────────────

export async function listDocumentSeries(): Promise<DocumentSeriesRow[]> {
  const rows = await prisma.documentSeries.findMany({
    orderBy: [{ type: "asc" }, { isDefault: "desc" }, { prefix: "asc" }],
  });
  return rows.map(toRow);
}

function toRow(r: {
  id: string;
  type: DocumentType;
  prefix: string;
  padding: number;
  lastNumber: number;
  isDefault: boolean;
  externalOnly: boolean;
  note: string | null;
}): DocumentSeriesRow {
  return {
    ...r,
    nextNumber: r.externalOnly
      ? "ERP"
      : formatDocumentNumber(r.prefix, r.padding, r.lastNumber + 1),
  };
}

export async function createDocumentSeries(
  input: CreateDocumentSeriesInput,
): Promise<{ id: string }> {
  const prefix = input.prefix.trim().toUpperCase();
  const existing = await prisma.documentSeries.findFirst({
    where: { type: input.type, prefix },
    select: { id: true },
  });
  if (existing) {
    throw new BusinessError(
      "DUPLICATE_SERIES",
      "Bu tür için aynı ön ekle bir seri zaten var",
    );
  }

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) await clearDefault(tx, input.type);
    return tx.documentSeries.create({
      data: {
        type: input.type,
        prefix,
        padding: input.padding ?? 6,
        // Continuing an ERP serial means starting from where it is now.
        lastNumber: input.startFrom ?? 0,
        isDefault: input.isDefault ?? false,
        externalOnly: input.externalOnly ?? false,
        note: input.note ?? null,
      },
      select: { id: true },
    });
  });
}

export async function updateDocumentSeries(
  id: string,
  input: UpdateDocumentSeriesInput,
): Promise<{ id: string }> {
  const series = await prisma.documentSeries.findUnique({
    where: { id },
    select: { id: true, type: true, lastNumber: true },
  });
  if (!series) {
    throw new BusinessError("SERIES_NOT_FOUND", "Belge serisi bulunamadı");
  }
  // Moving the counter backwards would hand out a number twice.
  if (input.startFrom !== undefined && input.startFrom < series.lastNumber) {
    throw new BusinessError(
      "INVALID_SERIES_COUNTER",
      `Sayaç geriye alınamaz (şu an ${series.lastNumber})`,
      { lastNumber: series.lastNumber },
    );
  }

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) await clearDefault(tx, series.type);
    return tx.documentSeries.update({
      where: { id },
      data: {
        ...(input.padding !== undefined ? { padding: input.padding } : {}),
        ...(input.startFrom !== undefined ? { lastNumber: input.startFrom } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.externalOnly !== undefined
          ? { externalOnly: input.externalOnly }
          : {}),
        ...(input.note !== undefined ? { note: input.note ?? null } : {}),
      },
      select: { id: true },
    });
  });
}

async function clearDefault(tx: Client, type: DocumentType): Promise<void> {
  await tx.documentSeries.updateMany({
    where: { type, isDefault: true },
    data: { isDefault: false },
  });
}

/** A serial that has issued numbers is never deleted — the trail would break. */
export async function deleteDocumentSeries(id: string): Promise<void> {
  const series = await prisma.documentSeries.findUnique({
    where: { id },
    select: { lastNumber: true },
  });
  if (!series) {
    throw new BusinessError("SERIES_NOT_FOUND", "Belge serisi bulunamadı");
  }
  if (series.lastNumber > 0) {
    throw new BusinessError(
      "IN_USE",
      "Numara vermiş seri silinemez",
      { lastNumber: series.lastNumber },
    );
  }
  await prisma.documentSeries.delete({ where: { id } });
}
