import { prisma } from "@repo/database";
import { recordAudit, type AuditActor } from "./audit";
import type { AuditAction } from "@repo/types";

// Keeping the trail from growing forever, and getting it out of the system
// before it is deleted.
//
// The append-only rule still stands: nothing here edits a row. Deleting old
// entries is the one exception any retention policy has to make, and it is
// deliberately narrow — a caller names a cutoff date, the deletion itself is
// recorded, and there is an export that produces the same rows in a form an
// auditor can keep.

/** Default retention. Long enough to investigate, short enough to bound growth. */
export const DEFAULT_RETENTION_DAYS = 365;

export interface PurgeResult {
  deleted: number;
  /** Oldest entry left behind, so the caller can show what the trail now covers. */
  oldestRemaining: string | null;
}

/**
 * Delete entries older than the cutoff.
 *
 * Security actions can be kept longer than the rest: a failed login from two
 * years ago is worth more than a profile edit from two years ago, and the
 * volume is far lower.
 */
export async function purgeAuditLogs(params: {
  before: Date;
  /** Actions exempt from this pass. Defaults to none. */
  keepActions?: readonly AuditAction[];
  actor: AuditActor;
}): Promise<PurgeResult> {
  const { count } = await prisma.auditLog.deleteMany({
    where: {
      createdAt: { lt: params.before },
      ...(params.keepActions && params.keepActions.length > 0
        ? { action: { notIn: [...params.keepActions] } }
        : {}),
    },
  });

  const oldest = await prisma.auditLog.findFirst({
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  // The purge is itself an event worth keeping — otherwise the trail has a hole
  // with nothing explaining it.
  if (count > 0) {
    await recordAudit({
      actor: params.actor,
      action: "AUDIT_PURGED",
      summary: `${count} denetim kaydı silindi (${params.before.toISOString().slice(0, 10)} öncesi)`,
      entity: "AuditLog",
      meta: {
        before: params.before.toISOString(),
        deleted: count,
        keptActions: params.keepActions ?? [],
      },
    });
  }

  return {
    deleted: count,
    oldestRemaining: oldest?.createdAt.toISOString() ?? null,
  };
}

export interface AuditStats {
  total: number;
  oldest: string | null;
  newest: string | null;
  /** How many rows a purge at the default cutoff would remove. */
  olderThanRetention: number;
  retentionDays: number;
}

/** What the retention screen needs to show before anyone presses delete. */
export async function auditStats(
  retentionDays = DEFAULT_RETENTION_DAYS,
): Promise<AuditStats> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60_000);

  const [total, olderThanRetention, oldest, newest] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } }),
    prisma.auditLog.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.auditLog.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  return {
    total,
    olderThanRetention,
    retentionDays,
    oldest: oldest?.createdAt.toISOString() ?? null,
    newest: newest?.createdAt.toISOString() ?? null,
  };
}

/** CSV, so the export opens in the spreadsheet an auditor already uses. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  // Excel treats a leading =, +, - or @ as a formula. Prefixing with a quote
  // keeps an audit summary from executing in someone's spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

const EXPORT_HEADERS = [
  "Tarih",
  "İşlem",
  "Kullanıcı",
  "Rol",
  "Varlık",
  "Kayıt",
  "Özet",
  "IP",
  "Tarayıcı",
  "Ayrıntı",
];

/**
 * Stream the trail out as CSV.
 *
 * Paged rather than loaded whole: an export is exactly the moment the table is
 * at its largest, and reading a year of it into memory to build one string is
 * how an export takes the server down.
 */
export async function* exportAuditCsv(params: {
  from?: Date;
  to?: Date;
  batchSize?: number;
}): AsyncGenerator<string> {
  yield `${EXPORT_HEADERS.join(";")}\n`;

  const take = params.batchSize ?? 1_000;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.auditLog.findMany({
      where: {
        ...(params.from || params.to
          ? {
              createdAt: {
                ...(params.from ? { gte: params.from } : {}),
                ...(params.to ? { lte: params.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) return;

    yield rows
      .map((r) =>
        [
          csvCell(r.createdAt.toISOString()),
          csvCell(r.action),
          csvCell(r.actorEmail),
          csvCell(r.actorRole),
          csvCell(r.entity),
          csvCell(r.entityId),
          csvCell(r.summary),
          csvCell(r.ip),
          csvCell(r.userAgent),
          csvCell(r.meta),
        ].join(";"),
      )
      .join("\n")
      .concat("\n");

    if (rows.length < take) return;
    cursor = rows[rows.length - 1]!.id;
  }
}
