import { prisma } from "@repo/database";
import type { Role } from "@repo/types";

// One timeline out of three histories.
//
// The system records what happened in three places, each right for its own
// purpose: AuditLog for who did what to the system, OrderStatusHistory for how
// an order moved, Transaction for what the cari did. Answering "what happened
// with this customer last week" meant opening three screens and reading three
// orderings by hand.
//
// So this merges them for *reading*. It writes nothing and owns nothing: each
// source stays the record of truth for its own events, and deleting this file
// would lose no data. That is deliberate — a fourth table duplicating the other
// three would be free to disagree with them.

export type ActivityKind = "AUDIT" | "ORDER_STATUS" | "LEDGER";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  at: string;
  /** Turkish one-liner, ready to render. */
  summary: string;
  actorName: string | null;
  companyId: string | null;
  companyName: string | null;
  /** Where clicking the row should go, when there is somewhere to go. */
  href: string | null;
  /** Money, for ledger rows. */
  amount: string | null;
}

export interface ActivityQuery {
  companyId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface ActivityViewer {
  userId: string;
  role: Role;
  companyId: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  PENDING_APPROVAL: "Onay bekliyor",
  PENDING_CREDIT: "Limit onayı bekliyor",
  CONFIRMED: "Onaylandı",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Sevk edildi",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal edildi",
  REJECTED: "Reddedildi",
};

/**
 * Which companies this viewer may see activity for.
 *
 * Returns null for "everything" (super admin) and a possibly-empty list
 * otherwise. An empty list means *no rows*, never all rows — the difference
 * between a rep with no portfolio and an administrator.
 */
async function visibleCompanyIds(
  viewer: ActivityViewer,
  requested?: string,
): Promise<string[] | null> {
  switch (viewer.role) {
    case "SUPER_ADMIN":
      return requested ? [requested] : null;
    case "SALES_REP": {
      const rows = await prisma.company.findMany({
        where: { salesRepId: viewer.userId, ...(requested ? { id: requested } : {}) },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }
    default: {
      if (!viewer.companyId) return [];
      if (requested && requested !== viewer.companyId) return [];
      return [viewer.companyId];
    }
  }
}

/**
 * The merged stream, newest first.
 *
 * Each source is queried for the same window and the same limit, then the three
 * are merged and cut. Reading `limit` from each is what makes the merge correct:
 * take fewer from one and a busy source could crowd the others out of the page.
 */
export async function listActivity(
  viewer: ActivityViewer,
  query: ActivityQuery = {},
): Promise<ActivityEntry[]> {
  const limit = Math.min(query.limit ?? 50, 200);
  const companyIds = await visibleCompanyIds(viewer, query.companyId);
  if (companyIds !== null && companyIds.length === 0) return [];

  const period =
    query.from || query.to
      ? {
          ...(query.from ? { gte: query.from } : {}),
          ...(query.to ? { lte: query.to } : {}),
        }
      : undefined;

  const companyFilter = companyIds ? { companyId: { in: companyIds } } : {};

  const [statusRows, ledgerRows, auditRows] = await Promise.all([
    prisma.orderStatusHistory.findMany({
      where: {
        ...(period ? { createdAt: period } : {}),
        order: companyIds ? { companyId: { in: companyIds } } : {},
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        fromStatus: true,
        toStatus: true,
        note: true,
        changedBy: { select: { name: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            companyId: true,
            company: { select: { name: true } },
          },
        },
      },
    }),

    prisma.transaction.findMany({
      where: { ...companyFilter, ...(period ? { createdAt: period } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        type: true,
        amount: true,
        description: true,
        companyId: true,
        company: { select: { name: true } },
        recordedBy: { select: { name: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    }),

    // The audit trail is system-wide and names no company, so only an
    // administrator sees it here. Showing a customer the trail of everyone
    // else's logins because the row happened to have no companyId would be
    // exactly the leak this merge could accidentally introduce.
    viewer.role === "SUPER_ADMIN"
      ? prisma.auditLog.findMany({
          where: period ? { createdAt: period } : {},
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            id: true,
            createdAt: true,
            action: true,
            summary: true,
            actorEmail: true,
            entity: true,
            entityId: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const entries: ActivityEntry[] = [
    ...statusRows.map((r) => ({
      id: `status:${r.id}`,
      kind: "ORDER_STATUS" as const,
      at: r.createdAt.toISOString(),
      summary: r.fromStatus
        ? `${r.order.orderNumber}: ${STATUS_LABELS[r.fromStatus] ?? r.fromStatus} → ${STATUS_LABELS[r.toStatus] ?? r.toStatus}${r.note ? ` (${r.note})` : ""}`
        : `${r.order.orderNumber} oluşturuldu: ${STATUS_LABELS[r.toStatus] ?? r.toStatus}`,
      actorName: r.changedBy?.name ?? null,
      companyId: r.order.companyId,
      companyName: r.order.company.name,
      href: `/orders/${r.order.id}`,
      amount: null,
    })),

    ...ledgerRows.map((r) => ({
      id: `ledger:${r.id}`,
      kind: "LEDGER" as const,
      at: r.createdAt.toISOString(),
      summary:
        r.description ??
        (r.type === "DEBIT" ? "Cari borç kaydı" : "Cari tahsilat kaydı"),
      actorName: r.recordedBy?.name ?? null,
      companyId: r.companyId,
      companyName: r.company.name,
      href: r.order ? `/orders/${r.order.id}` : null,
      amount: `${r.type === "DEBIT" ? "" : "-"}${r.amount.toFixed(2)}`,
    })),

    ...auditRows.map((r) => ({
      id: `audit:${r.id}`,
      kind: "AUDIT" as const,
      at: r.createdAt.toISOString(),
      summary: r.summary,
      actorName: r.actorEmail,
      companyId: null,
      companyName: null,
      href:
        r.entity === "Order" && r.entityId ? `/orders/${r.entityId}` : null,
      amount: null,
    })),
  ];

  return entries
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit);
}
