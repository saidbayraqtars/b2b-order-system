import { prisma } from "@repo/database";
import type { ErpSyncKind } from "@repo/types";
import { BusinessError } from "./errors";
import { Dec, round2 } from "./money";
import { applyErpStock } from "./stock-ledger";

// ERP'den gelen veriyi karşılamak.
//
// The agent sends normalised rows; this file decides what happens to them. Two
// decisions run through all of it:
//
//  **Matching, never creating.** A row whose `externalCode` matches nothing here
//  is recorded as an issue and skipped — it does not create a customer or a
//  product. The ERP holds 79.829 cari; importing them wholesale would fill this
//  system with rows nobody chose, each of which can log in, be ordered for and
//  appear in every report. Which customers exist in the B2B is a decision
//  somebody makes, and the mapping is how they express it.
//
//  **The skipped count is the point.** A sync that silently dropped 4.000 rows
//  looks identical to one that worked, unless someone counted. Every run
//  records received/applied/skipped, and every skip keeps the code that did not
//  land — that code is what an operator pastes into the ERP to find out what it
//  was.

/** How many unmatched rows one run keeps. Beyond this the count still counts. */
const MAX_ISSUES_PER_RUN = 500;

export interface ErpCustomerRow {
  /** Cari kodu — the join key. */
  code: string;
  name?: string | null;
  taxNumber?: string | null;
  taxOffice?: string | null;
  balance?: number | string | null;
}

export interface ErpStockRow {
  /** Stok kodu. */
  code: string;
  quantity: number;
}

export interface ErpPriceRow {
  code: string;
  price: number | string;
  /** Which customer group this price is for; omitted means the default tier. */
  customerGroupCode?: string | null;
  minQuantity?: number | null;
}

export interface IngestResult {
  runId: string;
  received: number;
  applied: number;
  skipped: number;
  status: "SUCCEEDED" | "PARTIAL" | "FAILED";
}

interface Skip {
  externalCode: string;
  label?: string | null;
  reason: string;
}

/**
 * Open a run, apply the rows, close it — whatever happens.
 *
 * The run row is written before the work so that a crash mid-import leaves a
 * RUNNING row with a start time rather than no trace at all. An import that
 * vanished without a record is the failure mode this whole module exists to
 * make impossible.
 */
async function withRun<T extends { applied: number; skipped: Skip[] }>(
  kind: ErpSyncKind,
  agentId: string | null,
  received: number,
  work: () => Promise<T>,
): Promise<IngestResult> {
  const run = await prisma.erpSyncRun.create({
    data: { kind, agentId, received },
    select: { id: true },
  });

  try {
    const result = await work();
    const status = result.skipped.length > 0 ? "PARTIAL" : "SUCCEEDED";

    await prisma.erpSyncRun.update({
      where: { id: run.id },
      data: {
        status,
        applied: result.applied,
        skipped: result.skipped.length,
        finishedAt: new Date(),
        issues: {
          create: result.skipped.slice(0, MAX_ISSUES_PER_RUN).map((s) => ({
            externalCode: s.externalCode,
            label: s.label ?? null,
            reason: s.reason,
          })),
        },
      },
    });

    return {
      runId: run.id,
      received,
      applied: result.applied,
      skipped: result.skipped.length,
      status,
    };
  } catch (e) {
    await prisma.erpSyncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        finishedAt: new Date(),
      },
    });
    throw e;
  }
}

// ─────────────────────────────────────────────
// CARİ
// ─────────────────────────────────────────────

/**
 * Refresh what we know about customers we already have.
 *
 * Name, tax number and balance are updated; nothing is created. The balance
 * goes into `erpBalance`, never into `currentBalance` — that one is derived
 * from this system's own ledger and is what every screen adds up against.
 * Overwriting it with a figure from a different set of books would make the
 * balance disagree with the ekstre printed next to it.
 */
export async function ingestCustomers(
  rows: ErpCustomerRow[],
  agentId: string | null,
): Promise<IngestResult> {
  return withRun("CUSTOMERS", agentId, rows.length, async () => {
    const skipped: Skip[] = [];
    let applied = 0;
    const now = new Date();

    const codes = rows.map((r) => r.code.trim()).filter(Boolean);
    const known = await prisma.company.findMany({
      where: { externalCode: { in: codes } },
      select: { id: true, externalCode: true },
    });
    const byCode = new Map(known.map((c) => [c.externalCode!, c.id]));

    for (const row of rows) {
      const code = row.code.trim();
      if (!code) {
        skipped.push({ externalCode: "(boş)", reason: "Cari kodu boş" });
        continue;
      }
      const id = byCode.get(code);
      if (!id) {
        // Deliberate: the ERP has tens of thousands of cari, and which of them
        // are B2B customers is somebody's decision, not an import's.
        skipped.push({
          externalCode: code,
          label: row.name,
          reason: "Bu cari koduna bağlı firma yok — firma kartında eşleyin",
        });
        continue;
      }

      await prisma.company.update({
        where: { id },
        data: {
          ...(row.name?.trim() ? { name: row.name.trim() } : {}),
          ...(row.taxNumber?.trim() ? { taxNumber: row.taxNumber.trim() } : {}),
          ...(row.taxOffice?.trim() ? { taxOffice: row.taxOffice.trim() } : {}),
          ...(row.balance != null
            ? { erpBalance: round2(new Dec(row.balance)) }
            : {}),
          erpSyncedAt: now,
        },
      });
      applied++;
    }

    return { applied, skipped };
  });
}

// ─────────────────────────────────────────────
// STOK
// ─────────────────────────────────────────────

/**
 * Take the ERP's stock figure as the truth.
 *
 * It is the truth: the warehouse is counted there, goods leave on the ERP's
 * despatch notes, and this system only ever sees the part of the business that
 * comes through the B2B. A negative figure is clamped to zero rather than
 * refused — a customer-facing catalogue showing "-4 adet" helps nobody, and the
 * ERP's own reason for going negative is the ERP's business.
 *
 * Written as a *difference* through the stock ledger rather than as an
 * overwrite. The number lands in the same place either way; what changes is
 * that "gece ERP 40 adet düşürdü" becomes a row somebody can find. Rows the ERP
 * agrees with write nothing at all, so an hourly sync of 2.600 products does not
 * bury the ledger under 2.600 "değişmedi" entries.
 */
export async function ingestStock(
  rows: ErpStockRow[],
  agentId: string | null,
): Promise<IngestResult> {
  return withRun("STOCK", agentId, rows.length, async () => {
    const skipped: Skip[] = [];
    let applied = 0;
    const now = new Date();

    const codes = rows.map((r) => r.code.trim()).filter(Boolean);
    const known = await prisma.productVariant.findMany({
      where: { externalCode: { in: codes } },
      select: { id: true, externalCode: true, stock: true },
    });
    const byCode = new Map(known.map((v) => [v.externalCode!, v]));

    for (const row of rows) {
      const code = row.code.trim();
      const variant = code ? byCode.get(code) : undefined;
      if (!variant) {
        skipped.push({
          externalCode: code || "(boş)",
          reason: "Bu stok koduna bağlı varyant yok — ürün kartında eşleyin",
        });
        continue;
      }

      await applyErpStock(
        { variantId: variant.id, quantity: row.quantity, previous: variant.stock },
        { occurredAt: now },
      );
      // `erpSyncedAt` her satırda tazeleniyor, fark olmasa bile: sorusu "bu
      // sayı ne zaman doğrulandı", "ne zaman değişti" değil.
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { erpSyncedAt: now },
      });
      applied++;
    }

    return { applied, skipped };
  });
}

// ─────────────────────────────────────────────
// FİYAT
// ─────────────────────────────────────────────

/**
 * Update prices the ERP owns.
 *
 * Matched on (variant, customer group, quantity tier) — the same triple the
 * price table is unique on — so a re-run overwrites rather than accumulating.
 * A group code the B2B does not have is skipped rather than created: customer
 * groups drive who sees which price, and inventing one from an import would
 * quietly change what a customer is charged.
 */
export async function ingestPrices(
  rows: ErpPriceRow[],
  agentId: string | null,
): Promise<IngestResult> {
  return withRun("PRICES", agentId, rows.length, async () => {
    const skipped: Skip[] = [];
    let applied = 0;

    const codes = rows.map((r) => r.code.trim()).filter(Boolean);
    const known = await prisma.productVariant.findMany({
      where: { externalCode: { in: codes } },
      select: { id: true, externalCode: true },
    });
    const byCode = new Map(known.map((v) => [v.externalCode!, v.id]));

    const groups = await prisma.customerGroup.findMany({
      select: { id: true, name: true },
    });
    const groupByName = new Map(groups.map((g) => [g.name.toLocaleLowerCase("tr"), g.id]));

    for (const row of rows) {
      const code = row.code.trim();
      const variantId = code ? byCode.get(code) : undefined;
      if (!variantId) {
        skipped.push({
          externalCode: code || "(boş)",
          reason: "Bu stok koduna bağlı varyant yok — ürün kartında eşleyin",
        });
        continue;
      }

      let customerGroupId: string | null = null;
      if (row.customerGroupCode?.trim()) {
        const found = groupByName.get(row.customerGroupCode.trim().toLocaleLowerCase("tr"));
        if (!found) {
          skipped.push({
            externalCode: code,
            label: row.customerGroupCode,
            reason: "Bu müşteri grubu tanımlı değil",
          });
          continue;
        }
        customerGroupId = found;
      }

      const price = round2(new Dec(row.price));
      if (price.lessThan(0)) {
        skipped.push({ externalCode: code, reason: "Fiyat negatif" });
        continue;
      }
      const minQuantity = Math.max(1, Math.trunc(row.minQuantity ?? 1));

      // The default tier (no group) cannot be upserted by a compound key —
      // Postgres treats NULLs as distinct, which is why the partial unique
      // index Price_variant_default_tier_key exists. So it is matched by hand.
      const existing = await prisma.price.findFirst({
        where: { variantId, customerGroupId, minQuantity },
        select: { id: true },
      });

      if (existing) {
        await prisma.price.update({ where: { id: existing.id }, data: { price } });
      } else {
        await prisma.price.create({
          data: { variantId, customerGroupId, minQuantity, price },
        });
      }
      applied++;
    }

    return { applied, skipped };
  });
}

// ─────────────────────────────────────────────
// OKUMA
// ─────────────────────────────────────────────

export interface SyncRunRow {
  id: string;
  kind: ErpSyncKind;
  status: string;
  agentName: string | null;
  received: number;
  applied: number;
  skipped: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export async function listSyncRuns(limit = 50): Promise<SyncRunRow[]> {
  const rows = await prisma.erpSyncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: Math.min(limit, 200),
    select: {
      id: true,
      kind: true,
      status: true,
      received: true,
      applied: true,
      skipped: true,
      error: true,
      startedAt: true,
      finishedAt: true,
      agent: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    agentName: r.agent?.name ?? null,
    received: r.received,
    applied: r.applied,
    skipped: r.skipped,
    error: r.error,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  }));
}

export interface SyncIssueRow {
  id: string;
  externalCode: string;
  label: string | null;
  reason: string;
}

export async function listSyncIssues(runId: string, limit = 200): Promise<SyncIssueRow[]> {
  const run = await prisma.erpSyncRun.findUnique({
    where: { id: runId },
    select: { id: true },
  });
  if (!run) {
    throw new BusinessError("ERP_RUN_NOT_FOUND", "Eşitleme kaydı bulunamadı");
  }

  const rows = await prisma.erpSyncIssue.findMany({
    where: { runId },
    orderBy: { createdAt: "asc" },
    take: Math.min(limit, 500),
    select: { id: true, externalCode: true, label: true, reason: true },
  });
  return rows;
}

export interface MappingStatus {
  companies: { total: number; mapped: number };
  variants: { total: number; mapped: number };
  /** When the ERP last confirmed anything, per kind. */
  lastRuns: Array<{ kind: ErpSyncKind; startedAt: string; status: string }>;
}

/** "Is the mapping finished?" — the question the ERP screen opens on. */
export async function getMappingStatus(): Promise<MappingStatus> {
  const [companyTotal, companyMapped, variantTotal, variantMapped, runs] =
    await Promise.all([
      prisma.company.count(),
      prisma.company.count({ where: { externalCode: { not: null } } }),
      prisma.productVariant.count(),
      prisma.productVariant.count({ where: { externalCode: { not: null } } }),
      prisma.erpSyncRun.findMany({
        where: { status: { in: ["SUCCEEDED", "PARTIAL"] } },
        orderBy: { startedAt: "desc" },
        take: 20,
        select: { kind: true, startedAt: true, status: true },
      }),
    ]);

  const seen = new Set<string>();
  const lastRuns: MappingStatus["lastRuns"] = [];
  for (const run of runs) {
    if (seen.has(run.kind)) continue;
    seen.add(run.kind);
    lastRuns.push({
      kind: run.kind,
      startedAt: run.startedAt.toISOString(),
      status: run.status,
    });
  }

  return {
    companies: { total: companyTotal, mapped: companyMapped },
    variants: { total: variantTotal, mapped: variantMapped },
    lastRuns,
  };
}
