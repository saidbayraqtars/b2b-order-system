import { prisma } from "@repo/database";
import {
  reportConfigSchema,
  type ReportDataset,
  type ReportFileFormat,
  type ReportScheduleInput,
} from "@repo/types";
import { BusinessError } from "./errors";
import { sendMail, appUrl, type MailAttachment } from "./mail";
import { normalizeConfig, runReport, type ReportRunResult } from "./report-engine";
import type { ReportContext } from "./report-registry";
import { XLSX_CONTENT_TYPE, buildXlsx } from "./xlsx";

// Scheduled report delivery.
//
// A saved report mails itself on a period. Three decisions carry the whole file:
//
//  1. **It runs as its OWNER, never as "the system".** Report definitions can be
//     shared, and the engine applies the runner's row scope — so a report run
//     with no scope at all would hand a rep's shared sheet the whole company's
//     data. The owner is also who the recipients are answerable to.
//  2. **Claiming works exactly like the job scheduler's.** One UPDATE moves
//     `scheduleNextRunAt` forward and the row is ours only if it changed a row.
//     A report that goes out twice is a report people stop trusting.
//  3. **A failure is recorded, not thrown.** One report with a broken config
//     must not stop the other nine from being delivered.

/** Nobody wants a 40 MB spreadsheet in their inbox. */
const MAX_ROWS = 5000;

// ─────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Render a run result as CSV.
 *
 * Semicolon-separated and BOM-prefixed because the recipient opens it in a
 * Turkish-locale Excel: comma is the decimal separator there, so a comma-
 * separated file lands in one column, and without the BOM every "ş" arrives
 * broken.
 */
export function reportToCsv(result: ReportRunResult): string {
  const header = result.columns.map((c) => csvCell(c.label)).join(";");
  const lines = result.rows.map((row) =>
    result.columns.map((c) => csvCell(row[c.key])).join(";"),
  );
  // The BOM is an escape, not the literal character: an invisible byte in a
  // source file is exactly what a later edit deletes by accident, and nobody
  // would connect the broken "ş" in Excel back to this line.
  return `\uFEFF${[header, ...lines].join("\r\n")}\r\n`;
}

// ─────────────────────────────────────────────
// XLSX
// ─────────────────────────────────────────────

/**
 * The same result as a spreadsheet.
 *
 * Numbers go in as numbers, which is the whole reason this exists next to the
 * CSV: a Turkish-locale Excel reads "1234.56" from a CSV as text and a total of
 * a column of text is zero. The cell values are what the engine already
 * produced, so a computed column travels with the rest.
 */
export function reportToXlsx(result: ReportRunResult, name: string): Buffer {
  return buildXlsx(
    name,
    result.columns.map((c) => ({ label: c.label, width: c.width })),
    result.rows.map((row) => result.columns.map((c) => row[c.key] ?? null)),
  );
}

function fileName(name: string, at: Date, extension = "csv"): string {
  const slug = name
    .toLocaleLowerCase("tr")
    .replace(/[ıİ]/g, "i")
    .replace(/[şŞ]/g, "s")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const stamp = at.toISOString().slice(0, 10);
  return `${slug || "rapor"}-${stamp}.${extension}`;
}

/** Public name for a downloaded report file. */
export function reportFileName(
  name: string,
  format: ReportFileFormat,
  at: Date = new Date(),
): string {
  return fileName(name, at, format === "XLSX" ? "xlsx" : "csv");
}

// ─────────────────────────────────────────────
// SCHEDULE
// ─────────────────────────────────────────────

export interface ReportScheduleView {
  intervalMinutes: number | null;
  recipients: string[];
  format: ReportFileFormat;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastSummary: string | null;
}

/**
 * Turn scheduled delivery on or off for a saved report.
 *
 * Only someone who may edit the report may schedule it, and the report then
 * runs as its owner — so a shared report cannot be turned into a way of reading
 * data through somebody else's scope. A super admin editing a rep's report
 * still sends the rep's view of it.
 */
export async function setReportSchedule(
  id: string,
  input: ReportScheduleInput,
  ctx: ReportContext,
): Promise<ReportScheduleView> {
  const row = await prisma.reportDefinition.findUnique({
    where: { id },
    select: { id: true, ownerId: true, isShared: true },
  });
  if (!row) {
    throw new BusinessError("REPORT_NOT_FOUND", "Rapor bulunamadı", { id });
  }
  if (ctx.role !== "SUPER_ADMIN" && row.ownerId !== ctx.userId) {
    throw new BusinessError(
      "FORBIDDEN",
      "Bu raporun gönderim ayarını değiştirme yetkiniz yok",
    );
  }

  const off = input.intervalMinutes === null;
  if (!off && input.recipients.length === 0) {
    // Checked here and not only in the route schema: a schedule that is on with
    // nobody to send to is a job that fails on every single run, forever, and
    // the only sign of it is a red badge nobody is looking at.
    throw new BusinessError(
      "INVALID_SCHEDULE",
      "Gönderim için en az bir alıcı gerekli",
    );
  }

  const updated = await prisma.reportDefinition.update({
    where: { id },
    data: {
      scheduleIntervalMinutes: input.intervalMinutes,
      scheduleRecipients: off ? [] : input.recipients,
      scheduleFormat: input.format,
      // Turning it on schedules the first delivery one period out rather than
      // immediately: pressing "save" should not fire an e-mail at everyone.
      scheduleNextRunAt: off
        ? null
        : new Date(Date.now() + input.intervalMinutes! * 60_000),
    },
    select: SCHEDULE_SELECT,
  });
  return toScheduleView(updated);
}

const SCHEDULE_SELECT = {
  scheduleIntervalMinutes: true,
  scheduleRecipients: true,
  scheduleFormat: true,
  scheduleNextRunAt: true,
  scheduleLastRunAt: true,
  scheduleLastStatus: true,
  scheduleLastSummary: true,
} as const;

function toScheduleView(row: {
  scheduleIntervalMinutes: number | null;
  scheduleRecipients: string[];
  scheduleFormat: string;
  scheduleNextRunAt: Date | null;
  scheduleLastRunAt: Date | null;
  scheduleLastStatus: string | null;
  scheduleLastSummary: string | null;
}): ReportScheduleView {
  return {
    intervalMinutes: row.scheduleIntervalMinutes,
    recipients: row.scheduleRecipients,
    // Anything the column does not recognise reads as CSV rather than failing:
    // the delivery must survive a value written by a newer version.
    format: row.scheduleFormat === "XLSX" ? "XLSX" : "CSV",
    nextRunAt: row.scheduleNextRunAt?.toISOString() ?? null,
    lastRunAt: row.scheduleLastRunAt?.toISOString() ?? null,
    lastStatus: row.scheduleLastStatus,
    lastSummary: row.scheduleLastSummary,
  };
}

export async function getReportSchedule(
  id: string,
): Promise<ReportScheduleView | null> {
  const row = await prisma.reportDefinition.findUnique({
    where: { id },
    select: SCHEDULE_SELECT,
  });
  return row ? toScheduleView(row) : null;
}

// ─────────────────────────────────────────────
// DELIVERY
// ─────────────────────────────────────────────

interface DueReport {
  id: string;
  name: string;
  dataset: ReportDataset;
  config: unknown;
  ownerId: string;
  scheduleIntervalMinutes: number | null;
  scheduleRecipients: string[];
  scheduleFormat: string;
}

/**
 * Take ownership of one due report by pushing its next run forward.
 *
 * `updateMany` with the old timestamp in the WHERE is the whole guard: a second
 * runner finds zero rows and moves on. Returns false when somebody else got it.
 */
async function claim(report: DueReport, dueAt: Date): Promise<boolean> {
  const interval = report.scheduleIntervalMinutes ?? 1440;
  const { count } = await prisma.reportDefinition.updateMany({
    where: { id: report.id, scheduleNextRunAt: dueAt },
    data: { scheduleNextRunAt: new Date(Date.now() + interval * 60_000) },
  });
  return count === 1;
}

function bodyText(params: {
  name: string;
  rowCount: number;
  truncated: boolean;
  generatedAt: string;
}): string {
  return [
    `"${params.name}" raporu ektedir.`,
    "",
    `Satır sayısı: ${params.rowCount}`,
    ...(params.truncated
      ? ["Not: rapor sınıra takıldı, tamamı için sistemden açın."]
      : []),
    `Oluşturulma: ${new Date(params.generatedAt).toLocaleString("tr-TR")}`,
    "",
    `Raporlar: ${appUrl("/reports")}`,
    "",
    "B2B Sipariş Sistemi",
  ].join("\n");
}

/**
 * Run one report as its owner and mail it.
 *
 * Everything that can go wrong here is somebody's configuration: a deactivated
 * owner, a config edited into invalidity, an SMTP server that is down. Each one
 * is written to the report's own schedule status so it shows up next to the
 * report rather than only in a job log.
 */
async function deliver(report: DueReport): Promise<{ ok: boolean; summary: string }> {
  const owner = await prisma.user.findUnique({
    where: { id: report.ownerId },
    select: { id: true, role: true, companyId: true, isActive: true },
  });
  if (!owner || !owner.isActive) {
    // Deliberately not "run it as an admin instead": the person answerable for
    // what these recipients see is gone, so the delivery stops.
    return { ok: false, summary: "Rapor sahibi pasif — gönderim durduruldu" };
  }
  if (report.scheduleRecipients.length === 0) {
    return { ok: false, summary: "Alıcı tanımlı değil" };
  }

  const parsed = reportConfigSchema.safeParse(report.config);
  if (!parsed.success) {
    return { ok: false, summary: "Rapor tanımı okunamadı" };
  }

  const ctx: ReportContext = {
    userId: owner.id,
    role: owner.role,
    companyId: owner.companyId,
  };
  const config = normalizeConfig(report.dataset, parsed.data);
  const result = await runReport(
    report.dataset,
    { ...config, limit: Math.min(config.limit ?? MAX_ROWS, MAX_ROWS) },
    ctx,
  );

  const xlsx = report.scheduleFormat === "XLSX";
  const attachment: MailAttachment = xlsx
    ? {
        filename: fileName(report.name, new Date(), "xlsx"),
        content: reportToXlsx(result, report.name),
        contentType: XLSX_CONTENT_TYPE,
      }
    : {
        filename: fileName(report.name, new Date()),
        content: reportToCsv(result),
        contentType: "text/csv; charset=utf-8",
      };

  const mail = await sendMail({
    to: report.scheduleRecipients,
    subject: `${report.name} — ${new Date().toLocaleDateString("tr-TR")}`,
    text: bodyText({
      name: report.name,
      rowCount: result.rowCount,
      truncated: result.truncated,
      generatedAt: result.generatedAt,
    }),
    attachments: [attachment],
  });

  if (!mail.ok) {
    return { ok: false, summary: `E-posta gönderilemedi: ${mail.error ?? "?"}` };
  }
  return {
    ok: true,
    summary: `${result.rowCount} satır, ${report.scheduleRecipients.length} alıcıya gönderildi`,
  };
}

export interface DeliveryOutcome {
  reportId: string;
  name: string;
  ok: boolean;
  summary: string;
}

/**
 * Deliver every report whose time has come. The body of the
 * `scheduled-report-delivery` job.
 *
 * Safe to run twice: the second pass finds nothing due, because the first one
 * moved every timestamp it touched.
 */
export async function deliverDueReports(now = new Date()): Promise<DeliveryOutcome[]> {
  const due = await prisma.reportDefinition.findMany({
    where: {
      scheduleIntervalMinutes: { not: null },
      scheduleNextRunAt: { lte: now },
    },
    select: {
      id: true,
      name: true,
      dataset: true,
      config: true,
      ownerId: true,
      scheduleIntervalMinutes: true,
      scheduleRecipients: true,
      scheduleFormat: true,
      scheduleNextRunAt: true,
    },
    orderBy: { scheduleNextRunAt: "asc" },
    take: 50,
  });

  const outcomes: DeliveryOutcome[] = [];
  for (const report of due) {
    if (!report.scheduleNextRunAt) continue;
    if (!(await claim(report, report.scheduleNextRunAt))) continue;

    let outcome: { ok: boolean; summary: string };
    try {
      outcome = await deliver(report);
    } catch (err) {
      // One broken report must not take the rest of the round with it.
      outcome = {
        ok: false,
        summary: err instanceof Error ? err.message : "bilinmeyen hata",
      };
    }

    await prisma.reportDefinition.update({
      where: { id: report.id },
      data: {
        scheduleLastRunAt: new Date(),
        scheduleLastStatus: outcome.ok ? "OK" : "ERROR",
        scheduleLastSummary: outcome.summary.slice(0, 500),
      },
    });

    outcomes.push({
      reportId: report.id,
      name: report.name,
      ok: outcome.ok,
      summary: outcome.summary,
    });
  }

  return outcomes;
}
